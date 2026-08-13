import "server-only"
import { eq, and } from "drizzle-orm"
import { Inngest } from "inngest"

import { db } from "@/db"
import { bookings, slotHolds } from "@/db/schema"

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
export const inngest = new Inngest({ id: "turfkoi" })

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

export const inngestFunctions = [expireSlotHold, settleAtKickoff]
