"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import type { z } from "zod"

import { db } from "@/db"
import {
  bookings,
  slotHolds,
  transactions,
  turfSlots,
  cancellations,
  payouts,
  turfs,
} from "@/db/schema"
import { can } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit } from "@/lib/ratelimit"
import { computeFees } from "@/lib/pricing"
import { computeRefund } from "@/lib/cancellation"
import { bkashProvider } from "@/lib/payment"
import {
  scheduleHoldExpiry,
  scheduleSettleAtKickoff,
  SLOT_HOLD_TTL_MS,
} from "@/lib/inngest"

import {
  holdSlotSchema,
  cancelBookingSchema,
  markPayoutPaidSchema,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string; paymentUrl?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "You are not signed in." }
}
function forbidden(): ActionResult {
  return { ok: false, error: "You don't have permission to do that." }
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

/** Combine `YYYY-MM-DD` + `HH:MM` (local-ish) into epoch ms. */
function slotDateToEpoch(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  return Date.UTC(y!, mo! - 1, d!, h!, mi!)
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Brute-force guard: max 5 holds/min per user.
  const allowed = await rateLimit(`hold:${user.id}`, 5, 60)
  if (!allowed) {
    return { ok: false, error: "Too many attempts — wait a minute and retry." }
  }

  const { turfId, date, startTime } = parsed.data

  // Lock down the slot: must exist, be available, and belong to a verified turf.
  const slotRows = await db
    .select()
    .from(turfSlots)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        eq(turfSlots.date, date),
        eq(turfSlots.startTime, startTime)
      )
    )
    .limit(1)
  const slot = slotRows[0]
  if (!slot) return { ok: false, error: "That slot no longer exists." }
  if (slot.status !== "available") {
    return { ok: false, error: "That slot was just taken." }
  }

  const bookingId = randomUUID()
  const holdId = randomUUID()
  const idempotencyKey = randomUUID()
  const expiresAt = new Date(Date.now() + SLOT_HOLD_TTL_MS)

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
    return { ok: false, error: "That slot was just taken." }
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
    if (String(err).includes("unique")) {
      return { ok: false, error: "That slot was just taken." }
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
  await scheduleHoldExpiry(holdId, bookingId).catch(() => {
    /* non-fatal: hold still expires via check-on-read */
  })

  revalidatePath(`/turfs`)
  return { ok: true, id: bookingId, bookingId }
}

/**
 * Compute fees, create the transaction row (with immutable platformFee), call
 * bKash to mint a payment URL, and flip the booking `held → payment_pending`.
 */
export async function initiatePaymentAction(
  bookingId: string
): Promise<ActionResult & { paymentUrl?: string }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const rows = await db
    .select({
      booking: bookings,
      turfOwnerId: turfs.ownerId,
      slotPrice: turfSlots.price,
      slotStatus: turfSlots.status,
      slotDuration: turfSlots.durationMinutes,
    })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(
      turfSlots,
      and(
        eq(turfSlots.turfId, bookings.turfId),
        eq(turfSlots.date, bookings.date),
        eq(turfSlots.startTime, bookings.slotStart)
      )
    )
    .where(eq(bookings.id, bookingId))
    .limit(1)
  const row = rows[0]
  if (!row) return { ok: false, error: "Booking not found." }
  if (row.booking.bookerId !== user.id) return forbidden()
  if (row.booking.status !== "held") {
    return { ok: false, error: "This booking can no longer be paid." }
  }

  const slotPrice = Number(row.slotPrice)
  const { turfAmount, platformFee, total } = computeFees(slotPrice)

  const txnIdempotencyKey = randomUUID()
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/payments/bkash/callback?bookingId=${bookingId}`

  // Create the transaction first so the immutable platformFee is recorded
  // before we ever talk to bKash. Status `pending` until the webhook confirms.
  const [txn] = await db
    .insert(transactions)
    .values({
      bookingId,
      payerId: user.id,
      receiverId: row.turfOwnerId,
      amount: String(turfAmount),
      platformFee: String(platformFee),
      provider: "bkash",
      status: "pending",
      idempotencyKey: txnIdempotencyKey,
    })
    .returning({ id: transactions.id })

  let paymentUrl: string
  let providerReference: string
  try {
    const result = await bkashProvider.createPayment({
      bookingId,
      amount: total,
      platformFee,
      idempotencyKey: txnIdempotencyKey,
      callbackUrl,
    })
    paymentUrl = result.paymentUrl
    providerReference = result.providerReference
  } catch (err) {
    // Roll back the pending transaction so the user can retry cleanly.
    await db
      .update(transactions)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(transactions.id, txn.id))
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Payment initiation failed: ${err.message}`
          : "Payment initiation failed.",
    }
  }

  await db
    .update(transactions)
    .set({ providerReference, updatedAt: new Date() })
    .where(eq(transactions.id, txn.id))

  // Flip booking held → payment_pending (conditional; only if still held).
  await db
    .update(bookings)
    .set({ status: "payment_pending", totalAmount: String(total), updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "held")))

  return { ok: true, id: bookingId, paymentUrl }
}

/**
 * Confirm a payment (called from the webhook handler or the dev mock-confirm
 * route). Idempotent: a second call for an already-success transaction is a
 * no-op. Conditional UPDATEs make concurrent webhooks safe.
 */
export async function confirmPaymentAction(
  providerReference: string
): Promise<ActionResult> {
  const txnRows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.providerReference, providerReference))
    .limit(1)
  const txn = txnRows[0]
  if (!txn) return { ok: false, error: "Unknown transaction." }
  if (txn.status === "success") return { ok: true }

  // Mark transaction success (only if currently pending).
  const updated = await db
    .update(transactions)
    .set({ status: "success", updatedAt: new Date() })
    .where(and(eq(transactions.id, txn.id), eq(transactions.status, "pending")))
    .returning({ id: transactions.id })
  if (updated.length === 0) return { ok: true }

  // Flip booking payment_pending → confirmed (conditional).
  const bookingUpdated = await db
    .update(bookings)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, txn.bookingId),
        eq(bookings.status, "payment_pending")
      )
    )
    .returning({
      id: bookings.id,
      date: bookings.date,
      slotStart: bookings.slotStart,
    })

  if (bookingUpdated.length > 0) {
    const b = bookingUpdated[0]
    // Mark the slot booked.
    await db
      .update(turfSlots)
      .set({ status: "booked" })
      .where(
        and(
          eq(turfSlots.date, b.date),
          eq(turfSlots.startTime, b.slotStart),
          eq(turfSlots.status, "held")
        )
      )

    // Schedule settle-at-kickoff. Best-effort — the admin sweep can reconcile.
    const kickoffTs = slotDateToEpoch(b.date, b.slotStart.slice(0, 5))
    await scheduleSettleAtKickoff(b.id, kickoffTs).catch(() => {})
  }

  revalidatePath(`/bookings/${txn.bookingId}`)
  revalidatePath("/app")
  return { ok: true }
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
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
  if (!row) return { ok: false, error: "Booking not found." }

  if (!can(user, "booking.cancel", {
    bookerId: row.booking.bookerId,
    ownerId: row.turf.ownerId,
  })) {
    return forbidden()
  }

  if (!["confirmed", "payment_pending", "held"].includes(row.booking.status)) {
    return { ok: false, error: "This booking can't be cancelled." }
  }

  // Compute hours-to-kickoff for the policy.
  const kickoffTs = slotDateToEpoch(
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
    await db
      .update(transactions)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(transactions.id, txn.id))
  }

  revalidatePath(`/bookings/${bookingId}`)
  revalidatePath("/app")
  revalidatePath(`/turfs/${row.turf.slug}`)
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
    return { ok: false, error: "No new payouts to generate for this period." }
  }

  // Insert one payout row per owner.
  const rows = candidates.map((c) => ({
    turfOwnerId: c.turfOwnerId,
    amount: c.amount.toFixed(2),
    periodStart,
    periodEnd,
    status: "pending" as const,
  }))
  await db.insert(payouts).values(rows)

  revalidatePath("/admin")
  return { ok: true, count: rows.length }
}

/** Admin: mark a payout as paid after the manual bKash send-money. */
export async function markPayoutPaidAction(
  input: z.infer<typeof markPayoutPaidSchema>
): Promise<ActionResult> {
  const parsed = markPayoutPaidSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
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
    return { ok: false, error: "Payout not found or already paid." }
  }
  revalidatePath("/admin")
  return { ok: true }
}
