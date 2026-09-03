"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import type { z } from "zod"

import { db } from "@/db"
import { isUniqueViolation } from "@/db/errors"
import {
  bookings,
  matches,
  paymentSubmissions,
  slotHolds,
  transactions,
  turfSlots,
  cancellations,
  payouts,
  turfs,
} from "@/db/schema"
import { can } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { rateLimit } from "@/lib/ratelimit"
import { logger } from "@/lib/logger"
import { computeFees } from "@/lib/pricing"
import { holdExpiryFor, isSlotBookable, slotStartEpoch } from "@/lib/slot-expansion"
import { computeRefund } from "@/lib/cancellation"
import { scheduleHoldExpiry } from "@/lib/inngest"
import { createNotifications, notifyAdmins } from "@/features/notifications/create"
import { creditMatchFees } from "@/features/wallet/service"
import { confirmAsset } from "@/features/images/service"
import {
  submissionEvidenceSchema,
  normalizeTxId,
} from "@/features/payments/schemas"

import {
  holdSlotSchema,
  cancelBookingSchema,
  markPayoutPaidSchema,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}
function forbidden(): ActionResult {
  return { ok: false, error: "errors.noPermission" }
}

/** Compute slot end (HH:MM) from start + duration, wrapping at 24h. */
function slotEndTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number)
  const total = h! * 60 + m! + durationMinutes
  const wrapped = total % (24 * 60)
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0")
  const mm = String(wrapped % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * Hold a slot for the current user. Creates the slot_hold + a `held` booking
 * atomically-ish: the partial unique index `bookings_active_unique` rejects a
 * concurrent INSERT for the same (turf, date, slot_start) with a unique
 * violation, which we surface as a clean "just taken" error.
 */
export async function holdSlotAction(
  input: z.infer<typeof holdSlotSchema>
): Promise<ActionResult & { bookingId?: string }> {
  const parsed = holdSlotSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Brute-force guard: max 5 holds/min per user.
  const allowed = await rateLimit(`hold:${user.id}`, 5, 60)
  if (!allowed) {
    return { ok: false, error: "errors.rateLimited" }
  }

  const { turfId, date, startTime } = parsed.data

  // Lock down the slot: must exist, be available, and belong to a turf that
  // is verified and active — deactivated or unverified turfs take no bookings.
  const slotRows = await db
    .select({
      slot: turfSlots,
      isVerified: turfs.isVerified,
      isActive: turfs.isActive,
      ownerId: turfs.ownerId,
    })
    .from(turfSlots)
    .innerJoin(turfs, eq(turfs.id, turfSlots.turfId))
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        eq(turfSlots.date, date),
        eq(turfSlots.startTime, startTime)
      )
    )
    .limit(1)
  const row = slotRows[0]
  if (!row) return { ok: false, error: "turfs.errors.slotGone" }
  // An owner manages availability from the owner console (block/unblock) —
  // he never books his own turf, so self-holds are rejected outright.
  if (row.ownerId === user.id) {
    return { ok: false, error: "turfs.errors.ownerCannotBook" }
  }
  if (!row.isVerified || !row.isActive) {
    return { ok: false, error: "turfs.errors.notTakingBookings" }
  }
  const slot = row.slot
  if (slot.status !== "available") {
    return { ok: false, error: "turfs.errors.slotTaken" }
  }
  // Booking closes 20 minutes before kickoff (SLOT_BOOKING_CUTOFF_MINUTES).
  if (!isSlotBookable(slot.date, slot.startTime)) {
    return { ok: false, error: "turfs.errors.slotCutoff" }
  }

  const bookingId = randomUUID()
  const holdId = randomUUID()
  const idempotencyKey = randomUUID()
  // Manual bKash model: the hold lives up to 3h (capped at the booking
  // cutoff) so the user has time to send money and file the TxID.
  const expiresAt = holdExpiryFor(date, startTime)

  // Atomically claim the slot. The conditional UPDATE guarantees only one
  // concurrent request can flip it from available→held; the INSERT into
  // bookings then either succeeds or hits the partial unique index.
  const claimed = await db
    .update(turfSlots)
    .set({ status: "held" })
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        eq(turfSlots.date, date),
        eq(turfSlots.startTime, startTime),
        eq(turfSlots.status, "available")
      )
    )
    .returning({ turfId: turfSlots.turfId })

  if (claimed.length === 0) {
    return { ok: false, error: "turfs.errors.slotTaken" }
  }

  try {
    await db.insert(bookings).values({
      id: bookingId,
      turfId,
      date,
      slotStart: startTime,
      slotEnd: slotEndTime(startTime, slot.durationMinutes),
      bookerId: user.id,
      status: "held",
      idempotencyKey,
    })
  } catch (err) {
    // Race: another booking already claimed this slot. Roll back the slot hold.
    await db
      .update(turfSlots)
      .set({ status: "available" })
      .where(
        and(
          eq(turfSlots.turfId, turfId),
          eq(turfSlots.date, date),
          eq(turfSlots.startTime, startTime),
          eq(turfSlots.status, "held")
        )
      )
    if (isUniqueViolation(err)) {
      return { ok: false, error: "turfs.errors.slotTaken" }
    }
    throw err
  }

  await db.insert(slotHolds).values({
    id: holdId,
    turfId,
    date,
    startTime,
    heldBy: user.id,
    expiresAt,
  })

  // Schedule TTL expiry (best-effort; check-on-read in queries is the fallback).
  await scheduleHoldExpiry(holdId, bookingId, expiresAt).catch(() => {
    /* non-fatal: hold still expires via check-on-read */
  })

  revalidatePath(`/turfs`)
  return { ok: true, id: bookingId, bookingId }
}

/**
 * Manual bKash Send Money intake for a held booking: the user sends the
 * expected total to the DeshiTurf bKash number and files the TxID + optional
 * receipt. The submission sits `pending` until an admin VERIFIES it — only
 * then does the booking confirm (see payments/actions.ts). The amount is
 * recomputed SERVER-side from the slot price; the client never dictates money.
 */
export async function submitBookingPaymentAction(input: {
  bookingId: string
  transactionId: string
  senderNumber: string
  receiptPublicId?: string
  userNote?: string
}): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const rows = await db
    .select({
      booking: bookings,
      slotPrice: turfSlots.price,
    })
    .from(bookings)
    .innerJoin(
      turfSlots,
      and(
        eq(turfSlots.turfId, bookings.turfId),
        eq(turfSlots.date, bookings.date),
        eq(turfSlots.startTime, bookings.slotStart)
      )
    )
    .where(eq(bookings.id, input.bookingId))
    .limit(1)
  const row = rows[0]
  if (!row) return { ok: false, error: "booking.errors.notFound" }
  if (row.booking.bookerId !== user.id) return forbidden()
  // `held` = not submitted yet; `payment_pending` = resubmission after a
  // rejection. Anything else is not payable.
  if (!["held", "payment_pending"].includes(row.booking.status)) {
    return { ok: false, error: "booking.errors.notPayable" }
  }

  const evidence = submissionEvidenceSchema.safeParse({
    transactionId: input.transactionId,
    senderNumber: input.senderNumber,
    receiptPublicId: input.receiptPublicId,
    userNote: input.userNote,
  })
  if (!evidence.success) {
    return { ok: false, error: evidence.error.issues[0]?.message ?? "errors.invalid" }
  }

  // One pending submission per booking keeps the review queue honest.
  const [pending] = await db
    .select({ id: paymentSubmissions.id })
    .from(paymentSubmissions)
    .where(
      and(
        eq(paymentSubmissions.bookingId, input.bookingId),
        eq(paymentSubmissions.status, "pending")
      )
    )
    .limit(1)
  if (pending) {
    return { ok: false, error: "payments.errors.alreadyPending" }
  }

  // Receipt (optional): must exist in the payer's receipts folder.
  if (evidence.data.receiptPublicId) {
    const confirm = await confirmAsset(
      "receipt",
      user.id,
      evidence.data.receiptPublicId
    )
    if (!confirm.ok) return { ok: false, error: "payments.errors.receiptInvalid" }
  }

  // Amount authority: recompute from the slot price.
  const { total } = computeFees(Number(row.slotPrice))

  try {
    const [submission] = await db
      .insert(paymentSubmissions)
      .values({
        payerId: user.id,
        purpose: "turf_booking",
        bookingId: input.bookingId,
        amount: String(total),
        transactionId: normalizeTxId(evidence.data.transactionId),
        senderNumber: evidence.data.senderNumber,
        receiptPublicId: evidence.data.receiptPublicId ?? null,
        userNote: evidence.data.userNote || null,
      })
      .returning({ id: paymentSubmissions.id })

    // Flip booking held → payment_pending (conditional; only if still held).
    await db
      .update(bookings)
      .set({
        status: "payment_pending",
        totalAmount: String(total),
        updatedAt: new Date(),
      })
      .where(
        and(eq(bookings.id, input.bookingId), eq(bookings.status, "held"))
      )

    const [turfNameRow] = await db
      .select({ turfName: turfs.name })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(eq(bookings.id, input.bookingId))
      .limit(1)

    await notifyAdmins({
      type: "payment.submission_received",
      payload: {
        purpose: "turf_booking",
        amount: total,
        payerName: "",
        turfName: turfNameRow?.turfName ?? "",
      },
      entityType: "payment_submission",
      entityId: submission.id,
    }).catch(() => {})
  } catch (err) {
    if (isUniqueViolation(err)) {
      // payment_submissions_txid_live: this TxID already backs a live
      // (pending/consumed) submission — reuse is blocked.
      return { ok: false, error: "payments.errors.txidAlreadyUsed" }
    }
    throw err
  }

  revalidatePath(`/bookings/${input.bookingId}`)
  revalidatePath("/admin/payments")
  return { ok: true, id: input.bookingId }
}

/**
 * Cancel a confirmed booking per the turf owner's cancellation policy.
 * Records the refund, reopens the slot, and flips transaction state.
 */
export async function cancelBookingAction(
  input: z.infer<typeof cancelBookingSchema>
): Promise<ActionResult & { refundAmount?: number }> {
  const parsed = cancelBookingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { bookingId, reason } = parsed.data

  const rows = await db
    .select({
      booking: bookings,
      turf: turfs,
    })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(eq(bookings.id, bookingId))
    .limit(1)
  const row = rows[0]
  if (!row) return { ok: false, error: "booking.errors.notFound" }

  if (!can(user, "booking.cancel", {
    bookerId: row.booking.bookerId,
    ownerId: row.turf.ownerId,
  })) {
    return forbidden()
  }

  if (!["confirmed", "payment_pending", "held"].includes(row.booking.status)) {
    return { ok: false, error: "booking.errors.notCancellable" }
  }

  // Compute hours-to-kickoff for the policy.
  const kickoffTs = slotStartEpoch(
    row.booking.date,
    row.booking.slotStart.slice(0, 5)
  )
  const hoursToKickoff = (kickoffTs - Date.now()) / (60 * 60 * 1000)

  // Pull the latest transaction to know the turf-side amount.
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.bookingId, bookingId))
    .orderBy(sql`${transactions.createdAt} desc`)
    .limit(1)

  const turfAmount = txn
    ? Number(txn.amount) - Number(txn.platformFee)
    : Number(row.booking.totalAmount ?? 0)

  const decision = computeRefund(
    turfAmount,
    {
      cancellationPolicy: row.turf.cancellationPolicy,
      cancellationPolicyConfig: row.turf.cancellationPolicyConfig as {
        cutoffHours?: number
        tiers?: { withinHours: number; refundPercent: number }[]
      } | null,
    },
    hoursToKickoff
  )

  // Insert the cancellation record.
  await db.insert(cancellations).values({
    bookingId,
    cancelledBy: user.id,
    reason,
    refundAmount: String(decision.refundAmount),
  })

  // Flip the booking to cancelled.
  await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))

  // Void any pending payment evidence: the admin queue stays clean and the
  // TxID is freed (manual bKash model — the money may need re-sending).
  await db
    .update(paymentSubmissions)
    .set({
      status: "rejected",
      rejectReason: "booking_cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentSubmissions.bookingId, bookingId),
        eq(paymentSubmissions.status, "pending")
      )
    )

  // Reopen the slot.
  await db
    .update(turfSlots)
    .set({ status: "available" })
    .where(
      and(
        eq(turfSlots.date, row.booking.date),
        eq(turfSlots.startTime, row.booking.slotStart),
        eq(turfSlots.status, "booked")
      )
    )

  // Update transaction status (success → refunded | partially_refunded).
  if (txn && txn.status === "success") {
    const newStatus =
      decision.refundAmount >= Number(txn.amount)
        ? "refunded"
        : "partially_refunded"
    logger.info("booking.refunded", {
      bookingId,
      refundAmount: decision.refundAmount,
      policy: row.turf.cancellationPolicy,
    })
    await db
      .update(transactions)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(transactions.id, txn.id))
  }

  // Fall-through gap close: the booking anchored a match — the game can't
  // happen, so cancel it and credit both matchmaking fees back.
  const [attachedMatch] = await db
    .select({ id: matches.id, state: matches.state })
    .from(matches)
    .where(eq(matches.bookingId, bookingId))
    .limit(1)
  if (
    attachedMatch &&
    !["ongoing", "completed", "cancelled", "expired", "disputed"].includes(
      attachedMatch.state
    )
  ) {
    await db
      .update(matches)
      .set({ state: "cancelled", updatedAt: new Date() })
      .where(eq(matches.id, attachedMatch.id))
    await creditMatchFees(attachedMatch.id)
  }

  revalidatePath(`/bookings/${bookingId}`)
  revalidatePath("/app")
  revalidatePath(`/turfs/${row.turf.slug}`)

  // Notify the cancelling user's counterpart (in-app; best-effort).
  const cancellingBooker = user.id === row.booking.bookerId
  const counterpartId = cancellingBooker
    ? row.turf.ownerId
    : row.booking.bookerId
  if (counterpartId && counterpartId !== user.id) {
    await createNotifications(
      {
        type: "booking.cancelled",
        payload: {
          bookingId,
          turfName: row.turf.name,
          date: row.booking.date,
          startTime: row.booking.slotStart.slice(0, 5),
          // The refund lands in the booker's bKash — only they care about it.
          refundAmount: cancellingBooker ? undefined : decision.refundAmount,
        },
        entityType: "booking",
        entityId: bookingId,
      },
      [counterpartId]
    )
  }

  return { ok: true, id: bookingId, refundAmount: decision.refundAmount }
}

/**
 * Admin: generate weekly payout rows for settled bookings in [start,end].
 * Idempotent in spirit: bookings already covered by an existing payout row
 * are excluded (see listSettledForPayout).
 */
export async function generateWeeklyPayoutsAction(
  periodStart: string,
  periodEnd: string
): Promise<ActionResult & { count?: number }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!user.roles.includes("admin")) return forbidden()

  const { listSettledForPayout } = await import("./queries")
  const candidates = await listSettledForPayout(periodStart, periodEnd)
  if (candidates.length === 0) {
    return { ok: false, error: "booking.errors.noPayouts" }
  }

  // Insert one payout row per owner (payouts_period_unique guarantees a
  // period is never generated twice, even by two racing admins).
  const rows = candidates.map((c) => ({
    turfOwnerId: c.turfOwnerId,
    amount: c.amount.toFixed(2),
    periodStart,
    periodEnd,
    status: "pending" as const,
  }))
  try {
    await db.insert(payouts).values(rows)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "booking.errors.payoutAlreadyGenerated" }
    }
    throw err
  }

  void logAudit({
    actorId: user.id,
    action: "payout.generated",
    resourceType: "payout_period",
    resourceId: `${periodStart}..${periodEnd}`,
    after: { owners: rows.length, total: candidates.reduce((s, c) => s + c.amount, 0) },
  }).catch(() => {})

  revalidatePath("/admin")
  revalidatePath("/admin/payments")
  return { ok: true, count: rows.length }
}

/** Admin: mark a payout as paid after the manual bKash send-money. */
export async function markPayoutPaidAction(
  input: z.infer<typeof markPayoutPaidSchema>
): Promise<ActionResult> {
  const parsed = markPayoutPaidSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!user.roles.includes("admin")) return forbidden()

  const updated = await db
    .update(payouts)
    .set({
      status: "paid",
      providerReference: parsed.data.providerReference,
      paidAt: new Date(),
    })
    .where(
      and(eq(payouts.id, parsed.data.payoutId), eq(payouts.status, "pending"))
    )
    .returning({ id: payouts.id })

  if (updated.length === 0) {
    return { ok: false, error: "booking.errors.payoutAlreadyPaid" }
  }
  void logAudit({
    actorId: user.id,
    action: "payout.marked_paid",
    resourceType: "payout",
    resourceId: parsed.data.payoutId,
    after: { providerReference: parsed.data.providerReference },
  }).catch(() => {})
  revalidatePath("/admin")
  revalidatePath("/admin/payments")
  return { ok: true }
}
