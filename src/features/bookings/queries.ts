import "server-only"
import { and, desc, eq, gte, lte, inArray } from "drizzle-orm"

import { slotStartEpoch } from "@/lib/slot-expansion"
import { db } from "@/db"
import {
  bookings,
  matches,
  transactions,
  turfs,
  payouts,
} from "@/db/schema"

export type BookingDetail = Awaited<ReturnType<typeof getBooking>>

/** Full booking with the related turf + active transaction. */
export async function getBooking(id: string) {
  const rows = await db
    .select({
      booking: bookings,
      turf: turfs,
    })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(eq(bookings.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.bookingId, id))
    .orderBy(desc(transactions.createdAt))
    .limit(1)

  return { ...row, transaction: txn ?? null }
}

/** Booker's bookings, newest first. */
export async function listMyBookings(userId: string, limit = 20) {
  return db
    .select({
      id: bookings.id,
      turfName: turfs.name,
      turfSlug: turfs.slug,
      date: bookings.date,
      slotStart: bookings.slotStart,
      slotEnd: bookings.slotEnd,
      status: bookings.status,
      totalAmount: bookings.totalAmount,
    })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(eq(bookings.bookerId, userId))
    .orderBy(desc(bookings.date), desc(bookings.createdAt))
    .limit(limit)
}

/** Active (non-terminal) booking for a slot, if any — used by the slot picker. */
export async function getActiveBookingForSlot(
  turfId: string,
  date: string,
  startTime: string
) {
  const rows = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(
      and(
        eq(bookings.turfId, turfId),
        eq(bookings.date, date),
        eq(bookings.slotStart, startTime),
        inArray(bookings.status, [
          "held",
          "payment_pending",
          "confirmed",
        ])
      )
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * Booker's bookings for the match-creation picker. Split: `eligible` rows are
 * confirmed, kick off in the future, and have no match yet (matches are 1:1
 * with bookings); `pendingPayment` rows still need payment before a match can
 * be created on them. Kickoff is computed here (not SQL) from the date-only
 * + time-only columns via the shared Dhaka-time epoch helper.
 */
export async function listCreateMatchBookings(userId: string) {
  const rows = await db
    .select({
      id: bookings.id,
      turfName: turfs.name,
      turfArea: turfs.area,
      date: bookings.date,
      slotStart: bookings.slotStart,
      slotEnd: bookings.slotEnd,
      status: bookings.status,
      matchId: matches.id,
    })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .leftJoin(matches, eq(matches.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.bookerId, userId),
        inArray(bookings.status, ["confirmed", "held", "payment_pending"])
      )
    )
    .orderBy(desc(bookings.date), desc(bookings.createdAt))
    .limit(50)

  const eligible: typeof rows = []
  const pendingPayment: typeof rows = []
  for (const row of rows) {
    if (slotStartEpoch(row.date, row.slotStart) <= Date.now()) continue
    if (row.status === "confirmed") {
      if (row.matchId === null) eligible.push(row)
    } else {
      pendingPayment.push(row)
    }
  }
  return { eligible, pendingPayment }
}

/**
 * Settled (completed) transactions eligible for a payout sweep in [start,end].
 * Excludes transactions already attached to a payout row.
 *
 * `rebook_contingent` bookings that were cancelled are excluded by virtue of
 * their transaction being `refunded` — only `success` rows match.
 */
export interface PayoutCandidate {
  turfOwnerId: string
  amount: number
  bookingIds: string[]
}

export async function listSettledForPayout(
  periodStart: string,
  periodEnd: string
): Promise<PayoutCandidate[]> {
  // Left-join payouts on transactions to detect ones already paid out. Because
  // we don't store a transactions→payouts FK in schema, we treat a transaction
  // as paid once its booking_id appears in any payout row's covered set. The
  // simpler operational check: a transaction is "available" if no payout row
  // for the same turf_owner covers a period that includes this booking's date.
  // MVP simplification: dedupe by checking the booking is not already in any
  // payout's period range via a NOT EXISTS subquery.
  const rows = await db
    .select({
      turfOwnerId: turfs.ownerId,
      bookingId: bookings.id,
      amount: transactions.amount,
      platformFee: transactions.platformFee,
      bookingDate: bookings.date,
    })
    .from(transactions)
    .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(
      and(
        eq(transactions.status, "success"),
        eq(bookings.status, "completed"),
        gte(bookings.date, periodStart),
        lte(bookings.date, periodEnd)
      )
    )
    .orderBy(turfs.ownerId)

  // Booked turfs always have an owner; the null check is only for the type
  // (turfs.owner_id is nullable for seeded, unclaimed turfs).
  const ownered = rows.filter((r): r is (typeof rows)[number] & { turfOwnerId: string } => r.turfOwnerId !== null)
  if (ownered.length === 0) return []

  // Pull any payout rows that already cover these bookings (by owner + period).
  const ownerIds = Array.from(new Set(ownered.map((r) => r.turfOwnerId)))
  const existing = await db
    .select({
      turfOwnerId: payouts.turfOwnerId,
      periodStart: payouts.periodStart,
      periodEnd: payouts.periodEnd,
      status: payouts.status,
    })
    .from(payouts)
    .where(inArray(payouts.turfOwnerId, ownerIds))

  const isCovered = (ownerId: string, date: string) =>
    existing.some(
      (p) =>
        p.turfOwnerId === ownerId &&
        p.periodStart <= date &&
        p.periodEnd >= date
    )

  const byOwner = new Map<string, PayoutCandidate>()
  for (const r of ownered) {
    if (isCovered(r.turfOwnerId, r.bookingDate)) continue
    const cur = byOwner.get(r.turfOwnerId) ?? {
      turfOwnerId: r.turfOwnerId,
      amount: 0,
      bookingIds: [],
    }
    // Payout the turf-side amount (transaction.amount minus platform fee).
    cur.amount += Number(r.amount) - Number(r.platformFee)
    cur.bookingIds.push(r.bookingId)
    byOwner.set(r.turfOwnerId, cur)
  }

  return Array.from(byOwner.values())
}

/** Pending + recent payouts for the admin surface. */
export async function listAllPayouts(limit = 50) {
  return db
    .select({
      id: payouts.id,
      turfOwnerId: payouts.turfOwnerId,
      amount: payouts.amount,
      periodStart: payouts.periodStart,
      periodEnd: payouts.periodEnd,
      status: payouts.status,
      providerReference: payouts.providerReference,
      createdAt: payouts.createdAt,
      paidAt: payouts.paidAt,
    })
    .from(payouts)
    .orderBy(desc(payouts.createdAt))
    .limit(limit)
}
