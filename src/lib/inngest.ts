import "server-only"
import { and, eq, lte } from "drizzle-orm"
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

/**
 * ERP (ব্যবসা) Phase 2: auto-post recurring bills whose due date has arrived.
 * Nightly at 03:17 Asia/Dhaka (21:17 UTC — BD is fixed UTC+6, no DST). Each
 * missed occurrence posts one expense (source='bill') and the rule advances;
 * catch-up is bounded so a corrupt date can't loop forever. Re-runs are safe:
 * the due date only advances after the expense insert succeeds.
 */
export const erpAutoPostBills = inngest.createFunction(
  {
    id: "erp-autopost-bills",
    name: "Auto-post due ERP bills",
    triggers: [{ cron: "17 21 * * *" }],
  },
  async ({ step }) => {
    const { erpAuditLogs, erpExpenses, erpRecurringRules } = await import(
      "@/db/schema"
    )
    const { todayInDhaka } = await import("@/lib/slot-expansion")
    const { catchUpRule } = await import("@/features/erp/finance")

    const rules = await step.run("collect-due-rules", async () => {
      const today = todayInDhaka()
      return db
        .select()
        .from(erpRecurringRules)
        .where(
          and(
            eq(erpRecurringRules.autoPost, true),
            eq(erpRecurringRules.isActive, true),
            lte(erpRecurringRules.nextDueDate, today)
          )
        )
    })
    if (!rules || rules.length === 0) return { posted: 0 }

    let posted = 0
    for (const rule of rules) {
      await step.run(`post-${rule.id}`, async () => {
        const today = todayInDhaka()
        const { occurrences, nextDueDate } = catchUpRule(
          { nextDueDate: rule.nextDueDate, frequency: rule.frequency },
          today
        )
        for (const date of occurrences) {
          await db.insert(erpExpenses).values({
            ownerId: rule.ownerId,
            turfId: rule.turfId,
            categoryId: rule.categoryId,
            source: "bill",
            sourceRefId: rule.id,
            amount: rule.amount,
            date,
            note: rule.name,
            createdBy: rule.ownerId, // system job — audit attributes to the owner
          })
          await db.insert(erpAuditLogs).values({
            ownerId: rule.ownerId,
            actorId: rule.ownerId,
            entity: "expense",
            entityId: rule.id,
            action: "create",
            amount: rule.amount,
            diff: { automated: true, occurrence: date },
          })
        }
        await db
          .update(erpRecurringRules)
          .set({ nextDueDate, updatedAt: new Date() })
          .where(eq(erpRecurringRules.id, rule.id))
        posted += occurrences.length
        return { ruleId: rule.id, occurrences: occurrences.length }
      })
    }
    return { posted }
  }
)

/**
 * ERP daily reminder fan-out (04:07 Asia/Dhaka = 22:07 UTC; BD fixed UTC+6):
 * bills due within 3 days and pending salaries → owner bell notifications.
 * Deduped per day via erp_profiles.settings (lastBillAlertOn/lastSalaryAlertOn)
 * so re-runs and retries never spam the owner.
 */
export const erpNotificationsDaily = inngest.createFunction(
  {
    id: "erp-notifications-daily",
    name: "Send daily ERP bill/salary reminders",
    triggers: [{ cron: "7 22 * * *" }],
  },
  async ({ step }) => {
    const { erpProfiles, erpRecurringRules } = await import("@/db/schema")
    const { createNotifications } = await import("@/features/notifications/create")
    const { todayInDhaka } = await import("@/lib/slot-expansion")

    const today = await step.run("compute-day", async () => todayInDhaka())
    const in3 = await step.run("compute-window", async () => {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + 3)
      return d.toISOString().slice(0, 10)
    })

    const rules = await step.run("collect-due-bills", async () => {
      const { and, eq, lte: le } = await import("drizzle-orm")
      return db
        .select()
        .from(erpRecurringRules)
        .where(
          and(
            eq(erpRecurringRules.isActive, true),
            le(erpRecurringRules.nextDueDate, in3)
          )
        )
    })

    const ownersWithBills = [
      ...new Set(rules.map((r) => r.ownerId)),
    ]

    await step.run("send-bill-reminders", async () => {
      const { and, eq, lte: le } = await import("drizzle-orm")
      for (const ownerId of ownersWithBills) {
        const [profile] = await db
          .select()
          .from(erpProfiles)
          .where(eq(erpProfiles.ownerId, ownerId))
          .limit(1)
        const settings = (profile?.settings ?? {}) as Record<string, unknown>
        if (settings.lastBillAlertOn === today) continue

        const [nextRule] = await db
          .select({ name: erpRecurringRules.name, nextDueDate: erpRecurringRules.nextDueDate })
          .from(erpRecurringRules)
          .where(
            and(
              eq(erpRecurringRules.ownerId, ownerId),
              eq(erpRecurringRules.isActive, true),
              le(erpRecurringRules.nextDueDate, in3)
            )
          )
          .orderBy(erpRecurringRules.nextDueDate)
          .limit(1)
        if (!nextRule) continue

        await createNotifications(
          {
            type: "erp.bill_due",
            payload: { name: nextRule.name, dueDate: nextRule.nextDueDate },
          },
          [ownerId]
        )
        settings.lastBillAlertOn = today
        await db
          .update(erpProfiles)
          .set({ settings, updatedAt: new Date() })
          .where(eq(erpProfiles.ownerId, ownerId))
      }
    })

    await step.run("send-salary-reminders", async () => {
      const { getSalaryMonth } = await import("@/features/erp/queries")
      const { monthOfDate } = await import("@/features/erp/finance")
      const month = monthOfDate(today)
      const ownerIds = await db
        .selectDistinct({ ownerId: erpProfiles.ownerId })
        .from(erpProfiles)
      for (const { ownerId } of ownerIds) {
        const [profile] = await db
          .select()
          .from(erpProfiles)
          .where(eq(erpProfiles.ownerId, ownerId))
          .limit(1)
        const settings = (profile?.settings ?? {}) as Record<string, unknown>
        if (settings.lastSalaryAlertOn === today) continue
        const rows = await getSalaryMonth(ownerId, month)
        const pending = rows.filter((r) => r.status !== "paid")
        if (pending.length === 0) continue
        await createNotifications(
          { type: "erp.salary_pending", payload: { count: pending.length } },
          [ownerId]
        )
        settings.lastSalaryAlertOn = today
        await db
          .update(erpProfiles)
          .set({ settings, updatedAt: new Date() })
          .where(eq(erpProfiles.ownerId, ownerId))
      }
    })

    return { bills: ownersWithBills.length }
  }
)

// All durable jobs, declared after every function above (see the tail of
// this file for the full export).

/** Grace after kickoff before an unclaimed open match expires. */
export const MATCH_EXPIRY_GRACE_MS = 90 * 60 * 1000 // 90 minutes

/**
 * Fall-through safety net: an open match whose kickoff + grace elapsed never
 * found an opponent — expire it and credit the home captain's matchmaking
 * fee back. Conditional UPDATE makes re-runs safe.
 */
export const expireUnclaimedMatch = inngest.createFunction(
  {
    id: "match-expire-unclaimed",
    name: "Expire unclaimed open match and credit fee",
    triggers: [{ event: "match/expire.unclaimed" }],
  },
  async ({ event, step }) => {
    const { matchId } = (event.data ?? {}) as { matchId?: string }
    if (!matchId) return

    await step.run("expire-and-credit", async () => {
      const { matches } = await import("@/db/schema")
      const { creditMatchFees } = await import("@/features/wallet/service")
      const updated = await db
        .update(matches)
        .set({ state: "expired", updatedAt: new Date() })
        .where(and(eq(matches.id, matchId), eq(matches.state, "open")))
        .returning({ id: matches.id })
      if (updated.length === 0) return { expired: false }
      await creditMatchFees(matchId)
      return { expired: true }
    })
  }
)

/**
 * Helper: schedule unclaimed-match expiry for a freshly created match.
 * `kickoffTs` is the slot's epoch-ms start time.
 */
export async function scheduleMatchFeeExpiry(
  matchId: string,
  kickoffTs: number
) {
  await inngest.send({
    name: "match/expire.unclaimed",
    data: { matchId },
    ts: kickoffTs + MATCH_EXPIRY_GRACE_MS,
  })
}

/**
 * Nightly catch-up sweep (01:43 Asia/Dhaka = 19:43 UTC; BD fixed UTC+6):
 *  1. expire still-open matches whose kickoff + grace elapsed (missed events)
 *     and credit their fees — creditMatchFees is idempotent;
 *  2. fail wallet top-up entries stuck `pending` for over 24h (bKash never
 *     called back) so users can retry cleanly.
 */
export const matchFeeSweepNightly = inngest.createFunction(
  {
    id: "match-fee-sweep-nightly",
    name: "Expire stale open matches and stale wallet top-ups",
    triggers: [{ cron: "43 19 * * *" }],
  },
  async ({ step }) => {
    await step.run("expire-stale-open-matches", async () => {
      const { matches } = await import("@/db/schema")
      const { creditMatchFees } = await import("@/features/wallet/service")
      const cutoff = new Date(Date.now() - MATCH_EXPIRY_GRACE_MS)
      const stale = await db
        .update(matches)
        .set({ state: "expired", updatedAt: new Date() })
        .where(and(eq(matches.state, "open"), lte(matches.kickoffAt, cutoff)))
        .returning({ id: matches.id })
      let credited = 0
      for (const m of stale) {
        const n = await creditMatchFees(m.id)
        credited += n
      }
      return { expired: stale.length, feeCredits: credited }
    })

    await step.run("fail-stale-pending-topups", async () => {
      const { walletEntries } = await import("@/db/schema")
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const failed = await db
        .update(walletEntries)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(walletEntries.type, "topup"),
            eq(walletEntries.status, "pending"),
            lte(walletEntries.createdAt, cutoff)
          )
        )
        .returning({ id: walletEntries.id })
      return { failed: failed.length }
    })
  }
)

// All durable jobs, declared after every function above.
export const inngestFunctionsAll = [
  expireSlotHold,
  settleAtKickoff,
  hardAnonymizeAccount,
  materializeSchedulesNightly,
  erpAutoPostBills,
  erpNotificationsDaily,
  expireUnclaimedMatch,
  matchFeeSweepNightly,
]
