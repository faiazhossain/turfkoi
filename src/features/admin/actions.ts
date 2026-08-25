"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import type { z } from "zod"

import { db } from "@/db"
import {
  bookings,
  cancellations,
  matches,
  refundRequests,
  reports,
  transactions,
  turfSlots,
  turfs,
  userRoles,
  users,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { logger } from "@/lib/logger"

import {
  approveRefundSchema,
  rejectRefundSchema,
  requestRefundSchema,
  resolveMatchDisputeSchema,
  setUserRoleSchema,
  setUserStatusSchema,
  updateReportStatusSchema,
  verifyTurfSchema,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

async function requireAdmin(): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: "errors.notSignedIn" }
  if (!user.roles.includes("admin")) return { error: "errors.adminOnly" }
  return { id: user.id }
}

/** Wraps requireAdmin to return the action-result shape callers use. */
async function adminActor(): Promise<{ id: string } | { ok: false; error: string }> {
  const res = await requireAdmin()
  if ("error" in res) return { ok: false, error: res.error }
  return { id: res.id }
}

/** H4 threshold: refunds above this need a second admin to approve. */
const DUAL_CONTROL_THRESHOLD = 5000

/**
 * Shared money mutation. Mirrors `cancelBookingAction` minus the policy
 * computation — admins override the policy per B4. Records a `cancellations`
 * row, flips the transaction to refunded/partially_refunded, the booking to
 * refunded, and reopens the slot.
 *
 * Returns the new transaction status so callers can persist it on the
 * refund_requests row.
 */
async function executeRefund(
  bookingId: string,
  refundAmount: number,
  actorId: string,
  reason: string | undefined
): Promise<{ txnStatus: string }> {
  const rows = await db
    .select({ booking: bookings })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  const booking = rows[0]?.booking
  if (!booking) throw new Error("Booking not found")

  await db.insert(cancellations).values({
    bookingId,
    cancelledBy: actorId,
    reason: reason ?? "Admin refund override",
    refundAmount: refundAmount.toFixed(2),
  })

  // Flip booking → refunded (conditional; only if not already terminal).
  await db
    .update(bookings)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, bookingId),
        sql`${bookings.status} in ('confirmed','payment_pending','held','completed')`
      )
    )

  // Reopen the slot so it can be re-sold.
  await db
    .update(turfSlots)
    .set({ status: "available" })
    .where(
      and(
        eq(turfSlots.date, booking.date),
        eq(turfSlots.startTime, booking.slotStart),
        sql`${turfSlots.status} in ('held','booked')`
      )
    )

  // Flip the latest transaction.
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.bookingId, bookingId))
    .orderBy(sql`${transactions.createdAt} desc`)
    .limit(1)

  let txnStatus = "refunded"
  if (txn) {
    txnStatus =
      txn && refundAmount >= Number(txn.amount)
        ? "refunded"
        : "partially_refunded"
    await db
      .update(transactions)
      .set({ status: txnStatus as "refunded" | "partially_refunded", updatedAt: new Date() })
      .where(eq(transactions.id, txn.id))
  }

  logger.info("admin.refund_executed", {
    bookingId,
    refundAmount,
    txnStatus,
  })
  return { txnStatus }
}

// ---------------------------------------------------------------------------
// Turfs
// ---------------------------------------------------------------------------

export async function verifyTurfAction(
  input: z.infer<typeof verifyTurfSchema>
): Promise<ActionResult> {
  const parsed = verifyTurfSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  const updated = await db
    .update(turfs)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(
      and(
        eq(turfs.id, parsed.data.turfId),
        eq(turfs.isVerified, false),
        // Seeded turfs can't go public before an owner claims them.
        isNotNull(turfs.ownerId)
      )
    )
    .returning({ id: turfs.id })
  if (updated.length === 0) {
    const seeded = await db
      .select({ id: turfs.id })
      .from(turfs)
      .where(and(eq(turfs.id, parsed.data.turfId), isNull(turfs.ownerId)))
      .limit(1)
    if (seeded.length > 0) {
      return {
        ok: false,
        error: "admin.errors.turfUnclaimed",
      }
    }
    return { ok: false, error: "admin.errors.turfNotFoundVerified" }
  }
  revalidatePath("/admin/turfs")
  revalidatePath("/admin")
  return { ok: true, id: parsed.data.turfId }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function setUserStatusAction(
  input: z.infer<typeof setUserStatusSchema>
): Promise<ActionResult> {
  const parsed = setUserStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  // Guardrail: never suspend yourself.
  if (parsed.data.userId === actor.id && parsed.data.status === "suspended") {
    return { ok: false, error: "admin.errors.cantSuspendSelf" }
  }

  await db
    .update(users)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(users.id, parsed.data.userId))

  revalidatePath("/admin/users")
  return { ok: true, id: parsed.data.userId }
}

export async function setUserRoleAction(
  input: z.infer<typeof setUserRoleSchema>
): Promise<ActionResult> {
  const parsed = setUserRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  // Guardrail: never remove your own admin role.
  if (
    parsed.data.userId === actor.id &&
    parsed.data.role === "admin" &&
    !parsed.data.on
  ) {
    return { ok: false, error: "admin.errors.cantRemoveOwnAdmin" }
  }

  if (parsed.data.on) {
    await db
      .insert(userRoles)
      .values({ userId: parsed.data.userId, role: parsed.data.role })
      .onConflictDoNothing()
  } else {
    await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, parsed.data.userId),
          eq(userRoles.role, parsed.data.role)
        )
      )
  }
  revalidatePath("/admin/users")
  return { ok: true, id: parsed.data.userId }
}

// ---------------------------------------------------------------------------
// Refunds (H4 dual-control)
// ---------------------------------------------------------------------------

export async function requestRefundAction(
  input: z.infer<typeof requestRefundSchema>
): Promise<ActionResult & { needsApproval?: boolean }> {
  const parsed = requestRefundSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  const { bookingId, amount, reason } = parsed.data

  // The booking must exist and be in a refundable state.
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  if (!booking) return { ok: false, error: "booking.errors.notFound" }
  if (
    !["confirmed", "payment_pending", "held", "completed", "cancelled"].includes(
      booking.status
    )
  ) {
    return { ok: false, error: "admin.errors.notRefundable" }
  }

  // Stage the request row (always — audit trail).
  const [req] = await db
    .insert(refundRequests)
    .values({
      bookingId,
      requestedBy: actor.id,
      amount: amount.toFixed(2),
      reason,
      status: "pending",
    })
    .returning({ id: refundRequests.id })

  // H4: above the threshold → require a second admin. Below → execute inline.
  if (amount > DUAL_CONTROL_THRESHOLD) {
    revalidatePath("/admin/bookings")
    return { ok: true, id: req.id, needsApproval: true }
  }

  await executeRefund(bookingId, amount, actor.id, reason)
  await db
    .update(refundRequests)
    .set({ status: "executed", updatedAt: new Date() })
    .where(eq(refundRequests.id, req.id))

  revalidatePath("/admin/bookings")
  revalidatePath(`/bookings/${bookingId}`)
  return { ok: true, id: req.id, needsApproval: false }
}

export async function approveRefundAction(
  input: z.infer<typeof approveRefundSchema>
): Promise<ActionResult> {
  const parsed = approveRefundSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  const [req] = await db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.id, parsed.data.refundRequestId))
    .limit(1)
  if (!req) return { ok: false, error: "admin.errors.refundNotFound" }
  if (req.status !== "pending") {
    return { ok: false, error: "admin.errors.refundNotPending" }
  }
  // H4: dual-control — the requester cannot approve their own request.
  if (req.requestedBy === actor.id) {
    return {
      ok: false,
      error: "admin.errors.refundSelfApprove",
    }
  }

  await executeRefund(req.bookingId, Number(req.amount), actor.id, req.reason ?? undefined)
  await db
    .update(refundRequests)
    .set({
      status: "executed",
      approvedBy: actor.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(refundRequests.id, req.id))

  revalidatePath("/admin/bookings")
  revalidatePath(`/bookings/${req.bookingId}`)
  return { ok: true, id: req.id }
}

export async function rejectRefundAction(
  input: z.infer<typeof rejectRefundSchema>
): Promise<ActionResult> {
  const parsed = rejectRefundSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  const updated = await db
    .update(refundRequests)
    .set({ status: "rejected", approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(refundRequests.id, parsed.data.refundRequestId),
        eq(refundRequests.status, "pending")
      )
    )
    .returning({ id: refundRequests.id })
  if (updated.length === 0) {
    return { ok: false, error: "admin.errors.refundNotFoundOrPending" }
  }
  revalidatePath("/admin/bookings")
  return { ok: true, id: updated[0].id }
}

// ---------------------------------------------------------------------------
// Match disputes (B4)
// ---------------------------------------------------------------------------

export async function resolveMatchDisputeAction(
  input: z.infer<typeof resolveMatchDisputeSchema>
): Promise<ActionResult> {
  const parsed = resolveMatchDisputeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  const { matchId, decision, homeScore, awayScore } = parsed.data

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.resultStatus !== "disputed" && match.state !== "disputed") {
    return { ok: false, error: "admin.errors.notDisputed" }
  }

  if (decision === "scratch") {
    await db
      .update(matches)
      .set({
        state: "cancelled",
        // No "voided" value exists on resultStatus; "confirmed" marks the
        // dispute as closed (no longer disputed). Score is cleared.
        resultStatus: "confirmed",
        homeScore: null,
        awayScore: null,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId))
  } else {
    await db
      .update(matches)
      .set({
        state: "completed",
        resultStatus: "confirmed",
        homeScore: homeScore ?? match.homeScore,
        awayScore: awayScore ?? match.awayScore,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId))
  }

  revalidatePath("/admin/matches")
  revalidatePath(`/matches/${matchId}`)
  return { ok: true, id: matchId }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function updateReportStatusAction(
  input: z.infer<typeof updateReportStatusSchema>
): Promise<ActionResult> {
  const parsed = updateReportStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if ("error" in actor) return actor

  await db
    .update(reports)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(reports.id, parsed.data.reportId))

  revalidatePath("/admin/reports")
  return { ok: true, id: parsed.data.reportId }
}
