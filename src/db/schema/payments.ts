import { sql } from "drizzle-orm"
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { bookings } from "./bookings"
import { users } from "./users"

// ---------------------------------------------------------------------------
// Manual bKash Send Money intake (no merchant API). Every Taka enters the
// platform through a payment submission: the user sends money to the
// DeshiTurf bKash number and files the Transaction ID + optional receipt
// screenshot; an admin verifies the evidence before the business action
// unlocks.
//
// State model: `pending → consumed` (admin verify + business effect land in
// ONE statement, so "verified but not applied" cannot exist) or
// `pending → rejected` (with reason; frees the TxID for a corrected
// resubmission). A consumed TxID can never be resubmitted — the partial
// unique index below is the anti-reuse guard.
// ---------------------------------------------------------------------------

export const paymentPurpose = pgEnum("payment_purpose", [
  "wallet_topup",
  "turf_booking",
])

export const paymentSubmissionStatus = pgEnum("payment_submission_status", [
  "pending",
  "rejected",
  "consumed",
])

export const paymentSubmissions = pgTable(
  "payment_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    purpose: paymentPurpose("purpose").notNull(),
    // SERVER-computed expected amount (slot recompute / validated top-up
    // bounds) — the client never dictates money.
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // Set iff purpose = 'turf_booking'.
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "restrict",
    }),
    // bKash Transaction ID, normalized (trim + uppercase) in the action.
    transactionId: text("transaction_id").notNull(),
    // Sender's bKash number (who moved the money).
    senderNumber: text("sender_number").notNull(),
    // Optional Cloudinary public id of the receipt screenshot.
    receiptPublicId: text("receipt_public_id"),
    userNote: text("user_note"),
    status: paymentSubmissionStatus("status").notNull().default("pending"),
    rejectReason: text("reject_reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    consumedBy: uuid("consumed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One LIVE row per TxID ever: only one pending/consumed submission can
    // exist for a given Transaction ID (rejection frees it for resubmission).
    uniqueIndex("payment_submissions_txid_live")
      .on(t.transactionId)
      .where(sql`status <> 'rejected'`),
    index("payment_submissions_status_idx").on(t.status, t.createdAt),
    index("payment_submissions_payer_idx").on(t.payerId, t.createdAt),
    index("payment_submissions_booking_idx").on(t.bookingId),
  ]
)
