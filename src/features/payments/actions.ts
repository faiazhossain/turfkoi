"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { sql } from "drizzle-orm"

import { db } from "@/db"
import {
  bookings,
  paymentSubmissions,
  turfSlots,
  turfs,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { logger } from "@/lib/logger"
import { computeFees } from "@/lib/pricing"
import { slotStartEpoch } from "@/lib/slot-expansion"
import { scheduleSettleAtKickoff } from "@/lib/inngest"
import { createNotifications } from "@/features/notifications/create"
import { getWalletBalance } from "@/features/wallet/queries"
import { verifyTopupSubmission } from "@/features/wallet/service"

import { reviewSubmissionSchema } from "./schemas"

export type PaymentActionResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Admin decision on a manual bKash payment submission.
 *
 * REJECT: conditional `pending → rejected` with a mandatory reason; frees the
 * TxID so the payer can resubmit a corrected one.
 *
 * VERIFY: consumes the submission AND applies the business effect in ONE
 * statement per purpose — there is deliberately no intermediate "verified"
 * state, so a crash between verify and apply is impossible by construction:
 *   - wallet_topup  → wallet credited + ledger entry (verifyTopupSubmission)
 *   - turf_booking  → booking confirmed + transaction recorded + slot booked
 *
 * Amounts are NOT editable: the submission's amount is the server-computed
 * expectation; if the money actually sent differs, the admin rejects with a
 * reason and the payer resubmits.
 */
export async function reviewPaymentSubmissionAction(
  input: unknown
): Promise<PaymentActionResult> {
  const parsed = reviewSubmissionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }

  const admin = await getCurrentUser()
  if (!admin) return { ok: false, error: "errors.notSignedIn" }
  if (!admin.roles.includes("admin")) {
    return { ok: false, error: "errors.noPermission" }
  }
  const { id, decision } = parsed.data
  const rejectReason = parsed.data.rejectReason?.trim()
  if (decision === "reject" && !rejectReason) {
    return { ok: false, error: "payments.errors.rejectReasonRequired" }
  }

  const [sub] = await db
    .select()
    .from(paymentSubmissions)
    .where(eq(paymentSubmissions.id, id))
    .limit(1)
  if (!sub) return { ok: false, error: "payments.errors.notFound" }

  if (decision === "reject") {
    const rejected = await db
      .update(paymentSubmissions)
      .set({
        status: "rejected",
        rejectReason,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(paymentSubmissions.id, id), eq(paymentSubmissions.status, "pending"))
      )
      .returning({ id: paymentSubmissions.id })
    if (rejected.length === 0) {
      return { ok: false, error: "payments.errors.alreadyHandled" }
    }
    await createNotifications(
      {
        type: "payment.submission_rejected",
        payload: { purpose: sub.purpose, reason: rejectReason ?? "" },
        entityType: "payment_submission",
        entityId: sub.id,
      },
      [sub.payerId]
    ).catch(() => {})
    await logAudit({
      actorId: admin.id,
      action: "payment_submission.rejected",
      resourceType: "payment_submission",
      resourceId: sub.id,
      before: { status: sub.status, amount: sub.amount, txId: sub.transactionId },
      after: { status: "rejected", reason: rejectReason },
    }).catch(() => {})
    revalidatePath("/admin/payments")
    revalidatePath("/app/wallet")
    if (sub.bookingId) revalidatePath(`/bookings/${sub.bookingId}`)
    return { ok: true }
  }

  // ---- VERIFY ----
  if (sub.purpose === "wallet_topup") {
    const applied = await verifyTopupSubmission({
      submissionId: sub.id,
      adminId: admin.id,
      payerId: sub.payerId,
    })
    if (!applied) return { ok: false, error: "payments.errors.alreadyHandled" }

    const balance = await getWalletBalance(sub.payerId)
    await createNotifications(
      {
        type: "payment.submission_verified",
        payload: { purpose: sub.purpose, amount: Number(sub.amount), balanceAfter: balance },
        entityType: "payment_submission",
        entityId: sub.id,
      },
      [sub.payerId]
    ).catch(() => {})
    await logAudit({
      actorId: admin.id,
      action: "payment_submission.verified",
      resourceType: "payment_submission",
      resourceId: sub.id,
      before: { status: sub.status, amount: sub.amount, txId: sub.transactionId },
      after: { status: "consumed", effect: "wallet_credited", balanceAfter: balance },
    }).catch(() => {})
    revalidatePath("/admin/payments")
    revalidatePath("/app/wallet")
    revalidatePath("/app")
    return { ok: true }
  }

  // turf_booking: load booking + slot for the server-side fee recompute.
  const rows = await db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      date: bookings.date,
      slotStart: bookings.slotStart,
      bookerId: bookings.bookerId,
      turfOwnerId: turfs.ownerId,
      turfName: turfs.name,
      slotPrice: turfSlots.price,
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
    .where(eq(bookings.id, sub.bookingId ?? ""))
    .limit(1)
  const booking = rows[0]
  if (!booking) return { ok: false, error: "booking.errors.notFound" }
  if (!["held", "payment_pending"].includes(booking.status)) {
    // Hold expired / booking cancelled while evidence waited — the verify
    // guard below would no-op; tell the admin to reject instead.
    return { ok: false, error: "payments.errors.bookingNotActive" }
  }

  const { platformFee } = computeFees(Number(booking.slotPrice))

  const result = await db.execute(sql`
    WITH sub AS (
      UPDATE payment_submissions
      SET status = 'consumed',
          consumed_at = now(),
          consumed_by = ${admin.id}::uuid,
          reviewed_by = ${admin.id}::uuid,
          reviewed_at = now(),
          updated_at = now()
      WHERE id = ${sub.id}::uuid
        AND status = 'pending'
        AND purpose = 'turf_booking'
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = payment_submissions.booking_id
            AND b.status IN ('held', 'payment_pending')
        )
      RETURNING booking_id, payer_id, amount, transaction_id
    ), bk AS (
      UPDATE bookings
      SET status = 'confirmed', updated_at = now()
      WHERE id = (SELECT booking_id FROM sub)
        AND status IN ('held', 'payment_pending')
      RETURNING id, turf_id, date, slot_start, booker_id
    ), txn AS (
      INSERT INTO transactions (
        booking_id, payer_id, receiver_id, amount, platform_fee,
        provider, provider_reference, status, idempotency_key
      )
      SELECT bk.id, (SELECT payer_id FROM sub), t.owner_id,
             (SELECT amount::numeric FROM sub), ${platformFee}::numeric,
             'bkash', (SELECT transaction_id FROM sub), 'success',
             'bksub_' || ${sub.id}
      FROM bk
      JOIN turfs t ON t.id = bk.turf_id
      RETURNING id
    ), slot AS (
      UPDATE turf_slots
      SET status = 'booked'
      WHERE (turf_id, date, start_time) = (
        SELECT turf_id, date, slot_start FROM bk
      )
      AND status = 'held'
      RETURNING id
    )
    SELECT (SELECT count(*) FROM bk)::int AS confirmed
  `)
  const confirmed = Number(
    (result as unknown as { rows: { confirmed: number }[] }).rows?.[0]
      ?.confirmed ?? 0
  )
  if (confirmed === 0) {
    return { ok: false, error: "payments.errors.alreadyHandled" }
  }

  logger.info("booking.confirmed", { bookingId: booking.bookingId })

  // Schedule settle-at-kickoff. Best-effort — the admin sweep can reconcile.
  const kickoffTs = slotStartEpoch(booking.date, booking.slotStart.slice(0, 5))
  await scheduleSettleAtKickoff(booking.bookingId, kickoffTs).catch(() => {})

  const shared = {
    bookingId: booking.bookingId,
    turfName: booking.turfName ?? "",
    date: booking.date,
    startTime: booking.slotStart.slice(0, 5),
  }

  await createNotifications(
    { type: "booking.confirmed", payload: shared, entityType: "booking", entityId: booking.bookingId },
    [booking.bookerId]
  ).catch(() => {})
  if (booking.turfOwnerId && booking.turfOwnerId !== booking.bookerId) {
    await createNotifications(
      { type: "booking.received", payload: shared, entityType: "booking", entityId: booking.bookingId },
      [booking.turfOwnerId]
    ).catch(() => {})
  }
  await createNotifications(
    {
      type: "payment.submission_verified",
      payload: { purpose: sub.purpose, amount: Number(sub.amount) },
      entityType: "payment_submission",
      entityId: sub.id,
    },
    [sub.payerId]
  ).catch(() => {})

  await logAudit({
    actorId: admin.id,
    action: "payment_submission.verified",
    resourceType: "payment_submission",
    resourceId: sub.id,
    before: { status: sub.status, amount: sub.amount, txId: sub.transactionId },
    after: { status: "consumed", effect: "booking_confirmed", bookingId: booking.bookingId },
  }).catch(() => {})

  revalidatePath("/admin/payments")
  revalidatePath(`/bookings/${booking.bookingId}`)
  revalidatePath("/app")
  return { ok: true }
}
