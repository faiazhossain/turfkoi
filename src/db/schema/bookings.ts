import { sql } from "drizzle-orm"
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  time,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

import {
  bookingStatus,
  transactionStatus,
  paymentProvider,
  payoutStatus,
  refundRequestStatus,
} from "./enums"
import { users } from "./users"
import { turfs } from "./turfs"

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    slotStart: time("slot_start").notNull(),
    // Frozen at booking time so the settle-at-kickoff job and historical UI
    // remain correct even if the turf_slots row is later edited or deleted.
    slotEnd: time("slot_end").notNull(),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: bookingStatus("status").notNull().default("held"),
    // Client-generated UUID (audit J3) - makes booking creation safely retryable.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // SS27: one active booking per (turf, date, slot) - double-booking guard.
    uniqueIndex("bookings_active_unique")
      .on(t.turfId, t.date, t.slotStart)
      .where(sql`${t.status} in ('held', 'payment_pending', 'confirmed')`),
    index("bookings_turf_date_idx").on(t.turfId, t.date),
  ]
)

/**
 * H4 dual-control refund requests. Amounts > Tk5,000 must be approved by a
 * second admin before the refund executes (status pending → approved →
 * executed). Amounts <= Tk5,000 are executed inline (status pending →
 * executed). Either way a row is recorded for audit.
 */
export const refundRequests = pgTable(
  "refund_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    status: refundRequestStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [index("refund_requests_status_idx").on(t.status)]
)

// F3: transient slot holds with TTL - separate from bookings.
export const slotHolds = pgTable("slot_holds", {
  id: uuid("id").defaultRandom().primaryKey(),
  turfId: uuid("turf_id")
    .notNull()
    .references(() => turfs.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  heldBy: uuid("held_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    receiverId: uuid("receiver_id").references(() => users.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("BDT"),
    // Immutable after creation - enforced by a DB trigger (SS37). Drizzle marks intent.
    platformFee: numeric("platform_fee", { precision: 12, scale: 2 }).notNull(),
    provider: paymentProvider("provider").notNull(),
    // Named provider_reference (not provider_ref) per SS29 webhook idempotency convention.
    providerReference: text("provider_reference"),
    status: transactionStatus("status").notNull().default("created"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("transactions_status_idx").on(t.status)]
)

// F4: cancellation / refund audit trail.
export const cancellations = pgTable("cancellations", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "restrict" }),
  cancelledBy: uuid("cancelled_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason"),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// F5 / B3: turf-owner payouts - weekly, admin-triggered manual bKash.
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turfOwnerId: uuid("turf_owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: payoutStatus("status").notNull().default("pending"),
    providerReference: text("provider_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("payouts_owner_status_idx").on(t.turfOwnerId, t.status)]
)
