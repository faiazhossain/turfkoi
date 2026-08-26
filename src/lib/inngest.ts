import "server-only"
import { eq, and } from "drizzle-orm"
import { Inngest } from "inngest"

import { db } from "@/db"
import { bookings, slotHolds, turfSchedules } from "@/db/schema"
import { materializeTurfSchedule } from "@/features/turfs/materialize"

/**
 * Durable background jobs (audit G3). The money-flow model relies on two
 * scheduled jobs:
 *
 *   slot-hold-expire  — fires at a hold's expiresAt; releases the slot if the
 *                       booking never progressed past `held`.
 *   settle-at-kickoff — fires at the booking's kickoff; flips a `confirmed`
 *                       booking to `completed`. The transaction then becomes
 *                       payout-eligible for the weekly admin sweep.
 *
 * Both jobs are idempotent — re-runs are safe because transitions are
 * conditional UPDATEs (only one wins).
 */
export const inngest = new Inngest({ id: "deshiturf" })

export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000 // §27: 10-minute hold

/**
 * Release a hold whose TTL elapsed. If the booking is still `held` (no payment
 * initiated), expire it too. Conditional updates make this safe to fire
 * multiple times.
 */
export const expireSlotHold = inngest.createFunction(
  {
    id: "slot-hold-expire",
    name: "Release expired slot hold",
    triggers: [{ event: "slot/hold.expired" }],
  },
  async ({ event, step }) => {
    const { holdId, bookingId } = (event.data ?? {}) as {
      holdId?: string
      bookingId?: string
    }
    if (!holdId || !bookingId) return

    await step.run("expire-hold", async () => {
      await db.delete(slotHolds).where(eq(slotHolds.id, holdId))
      // Flip the booking to expired ONLY if it's still in `held` (payment
      // was never initiated). Confirmed/payment_pending bookings are left alone.
      await db
        .update(bookings)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(eq(bookings.id, bookingId), eq(bookings.status, "held"))
        )
      return { holdId, bookingId }
    })
  }
)

/**
 * Settle a confirmed booking at kickoff time. The transaction is captured —
 * the platform now owes the turf owner this amount at the next weekly payout.
 */
export const settleAtKickoff = inngest.createFunction(
  {
    id: "settle-at-kickoff",
    name: "Settle confirmed booking at kickoff",
    triggers: [{ event: "booking/settle.kickoff" }],
  },
  async ({ event, step }) => {
    const { bookingId } = (event.data ?? {}) as { bookingId?: string }
    if (!bookingId) return

    await step.run("complete-booking", async () => {
      const result = await db
        .update(bookings)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed"))
        )
        .returning({ id: bookings.id })
      return { settled: result.length > 0 }
    })
  }
)

// `inngestFunctions` exported via the serve route.

/**
 * Helper: schedule the expiry of a freshly created hold. Callers fire this
 * right after inserting the slot_hold row. The wait time matches the hold TTL
 * (§27: 10 minutes).
 */
export async function scheduleHoldExpiry(holdId: string, bookingId: string) {
  await inngest.send({
    name: "slot/hold.expired",
    data: { holdId, bookingId },
    ts: Date.now() + SLOT_HOLD_TTL_MS,
  })
}

/**
 * Helper: schedule settle-at-kickoff for a confirmed booking. `kickoffTs` is
 * the slot's epoch-ms start time.
 */
export async function scheduleSettleAtKickoff(
  bookingId: string,
  kickoffTs: number
) {
  await inngest.send({
    name: "booking/settle.kickoff",
    data: { bookingId },
    ts: kickoffTs,
  })
}

/** K3 grace period before a soft-deleted user is hard-anonymized. */
export const ACCOUNT_DELETION_GRACE_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

/**
 * K3 — after the 14-day grace window, hard-anonymize the user. Re-runs are
 * safe: anonymizeUser is idempotent (writing the placeholder phone twice is a
 * no-op modulo the unique constraint, which is satisfied by the hash).
 */
export const hardAnonymizeAccount = inngest.createFunction(
  {
    id: "account-hard-anonymize",
    name: "Anonymize deleted account after grace window",
    triggers: [{ event: "account/delete.hard" }],
  },
  async ({ event, step }) => {
    const { userId } = (event.data ?? {}) as { userId?: string }
    if (!userId) return
    await step.run("anonymize", async () => {
      const { anonymizeUser } = await import("@/features/auth/deletion")
      await anonymizeUser(userId)
      return { userId }
    })
  }
)

/**
 * Helper: schedule hard anonymization of a user-requested deletion. Fires after
 * the grace window; the user can cancel by signing back in, which reinstates
 * status (the Inngest job re-checks status before anonymizing).
 */
export async function scheduleAccountAnonymization(userId: string) {
  await inngest.send({
    name: "account/delete.hard",
    data: { userId },
    ts: Date.now() + ACCOUNT_DELETION_GRACE_MS,
  })
}

/**
 * Slot system P1: extend every turf's materialized slot horizon from its
 * active weekly schedule, nightly at 00:17 Asia/Dhaka (off the :00 mark to
 * avoid synchronized load with other scheduled jobs). Inngest cron runs in
 * UTC; Bangladesh is fixed UTC+6 with no DST, so 18:17 UTC IS 00:17 Dhaka
 * permanently. Re-runs are safe — materializeTurfSchedule is a diff that
 * only touches available template rows, so booked/held/manual inventory is
 * never disturbed.
 */
export const materializeSchedulesNightly = inngest.createFunction(
  {
    id: "schedule-materialize-nightly",
    name: "Extend slot horizon from active weekly schedules",
    triggers: [{ cron: "17 18 * * *" }],
  },
  async ({ step }) => {
    const turfIds = await step.run("collect-turfs", async () => {
      const rows = await db
        .selectDistinct({ turfId: turfSchedules.turfId })
        .from(turfSchedules)
        .where(eq(turfSchedules.isActive, true))
      return rows.map((r) => r.turfId)
    })
    if (!turfIds || turfIds.length === 0) return { turfs: 0 }

    for (const turfId of turfIds) {
      // One step per turf so a partial failure retries only that turf.
      await step.run(`materialize-${turfId}`, async () => {
        const res = await materializeTurfSchedule(turfId)
        return {
          turfId,
          inserted: res.inserted,
          updated: res.updated,
          deleted: res.deleted,
          conflicts: res.conflicts.length,
        }
      })
    }
    return { turfs: turfIds.length }
  }
)

export const inngestFunctions = [
  expireSlotHold,
  settleAtKickoff,
  hardAnonymizeAccount,
  materializeSchedulesNightly,
]
