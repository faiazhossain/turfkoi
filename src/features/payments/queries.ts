import { and, desc, eq, type SQL } from "drizzle-orm"

import { db } from "@/db"
import { bookings, paymentSubmissions, turfs, users } from "@/db/schema"

export type PaymentSubmissionRow = Awaited<
  ReturnType<typeof listPaymentSubmissions>
>[number]

/**
 * Admin queue for the Payment Verification Center. Joins the payer and, for
 * booking payments, the booking + turf so the admin can judge the evidence
 * (amount, purpose, related entity) in one view.
 */
export async function listPaymentSubmissions(
  status?: "pending" | "rejected" | "consumed",
  limit = 50
) {
  const where: SQL | undefined =
    status === undefined ? undefined : eq(paymentSubmissions.status, status)
  return db
    .select({
      id: paymentSubmissions.id,
      payerId: paymentSubmissions.payerId,
      payerName: users.name,
      payerPhone: users.phone,
      purpose: paymentSubmissions.purpose,
      amount: paymentSubmissions.amount,
      bookingId: paymentSubmissions.bookingId,
      turfName: turfs.name,
      bookingDate: bookings.date,
      bookingSlotStart: bookings.slotStart,
      bookingStatus: bookings.status,
      transactionId: paymentSubmissions.transactionId,
      senderNumber: paymentSubmissions.senderNumber,
      receiptPublicId: paymentSubmissions.receiptPublicId,
      userNote: paymentSubmissions.userNote,
      status: paymentSubmissions.status,
      rejectReason: paymentSubmissions.rejectReason,
      reviewedBy: paymentSubmissions.reviewedBy,
      reviewedAt: paymentSubmissions.reviewedAt,
      createdAt: paymentSubmissions.createdAt,
    })
    .from(paymentSubmissions)
    .innerJoin(users, eq(users.id, paymentSubmissions.payerId))
    .leftJoin(bookings, eq(bookings.id, paymentSubmissions.bookingId))
    .leftJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(where)
    .orderBy(desc(paymentSubmissions.createdAt))
    .limit(limit)
}

/** Latest submission attached to a booking (any status) — for the banner. */
export async function getBookingPaymentSubmission(bookingId: string) {
  const [row] = await db
    .select({
      id: paymentSubmissions.id,
      purpose: paymentSubmissions.purpose,
      amount: paymentSubmissions.amount,
      transactionId: paymentSubmissions.transactionId,
      senderNumber: paymentSubmissions.senderNumber,
      receiptPublicId: paymentSubmissions.receiptPublicId,
      status: paymentSubmissions.status,
      rejectReason: paymentSubmissions.rejectReason,
      createdAt: paymentSubmissions.createdAt,
    })
    .from(paymentSubmissions)
    .where(
      and(
        eq(paymentSubmissions.bookingId, bookingId),
        eq(paymentSubmissions.purpose, "turf_booking")
      )
    )
    .orderBy(desc(paymentSubmissions.createdAt))
    .limit(1)
  return row ?? null
}

/** A user's own submissions — for the wallet page submission list. */
export async function listMyPaymentSubmissions(payerId: string, limit = 20) {
  return db
    .select({
      id: paymentSubmissions.id,
      purpose: paymentSubmissions.purpose,
      amount: paymentSubmissions.amount,
      transactionId: paymentSubmissions.transactionId,
      status: paymentSubmissions.status,
      rejectReason: paymentSubmissions.rejectReason,
      createdAt: paymentSubmissions.createdAt,
    })
    .from(paymentSubmissions)
    .where(eq(paymentSubmissions.payerId, payerId))
    .orderBy(desc(paymentSubmissions.createdAt))
    .limit(limit)
}
