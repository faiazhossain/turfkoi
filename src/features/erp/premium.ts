import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { erpAuditLogs, erpPremiumRequests, erpProfiles, users } from "@/db/schema"
import { ensureErpProfile } from "./profile"
import { nextPremiumUntil } from "./premium-plans"

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOwnerPremiumRequests(ownerId: string, limit = 10) {
  return db
    .select()
    .from(erpPremiumRequests)
    .where(eq(erpPremiumRequests.ownerId, ownerId))
    .orderBy(desc(erpPremiumRequests.createdAt))
    .limit(limit)
}

export async function getPendingPremiumRequest(ownerId: string) {
  const [row] = await db
    .select()
    .from(erpPremiumRequests)
    .where(
      and(
        eq(erpPremiumRequests.ownerId, ownerId),
        eq(erpPremiumRequests.status, "pending")
      )
    )
    .orderBy(desc(erpPremiumRequests.createdAt))
    .limit(1)
  return row ?? null
}

export async function listPendingPremiumRequests() {
  return db
    .select({
      id: erpPremiumRequests.id,
      ownerId: erpPremiumRequests.ownerId,
      months: erpPremiumRequests.months,
      amount: erpPremiumRequests.amount,
      method: erpPremiumRequests.method,
      senderNumber: erpPremiumRequests.senderNumber,
      transactionId: erpPremiumRequests.transactionId,
      receiptPublicId: erpPremiumRequests.receiptPublicId,
      ownerNote: erpPremiumRequests.ownerNote,
      createdAt: erpPremiumRequests.createdAt,
      ownerPhone: users.phone,
      ownerName: users.name,
    })
    .from(erpPremiumRequests)
    .innerJoin(users, eq(erpPremiumRequests.ownerId, users.id))
    .where(eq(erpPremiumRequests.status, "pending"))
    .orderBy(desc(erpPremiumRequests.createdAt))
}

export async function countPendingPremiumRequests(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(erpPremiumRequests)
    .where(eq(erpPremiumRequests.status, "pending"))
  return row?.count ?? 0
}

export interface ErpProfileAdminRow {
  ownerId: string
  ownerName: string | null
  ownerPhone: string
  plan: string
  premiumUntil: Date | null
  trialEndsAt: Date
  pendingRequests: number
}

/** All owner ERP profiles with plan/trial state — the admin console table. */
export async function listErpProfileAdminRows(): Promise<ErpProfileAdminRow[]> {
  const rows = await db
    .select({
      ownerId: sql<string>`p.owner_id`,
      ownerName: users.name,
      ownerPhone: users.phone,
      plan: sql<string>`p.plan`,
      premiumUntil: sql<Date | null>`p.premium_until`,
      trialEndsAt: sql<Date>`p.trial_ends_at`,
      pendingRequests: sql<number>`(
        select count(*)::int from erp_premium_requests r
        where r.owner_id = p.owner_id and r.status = 'pending'
      )`,
    })
    .from(sql`erp_profiles p`)
    .innerJoin(users, eq(users.id, sql`p.owner_id`))
    .orderBy(desc(sql`p.premium_until`))
  return rows.map((r) => ({
    ...r,
    premiumUntil: r.premiumUntil ? new Date(r.premiumUntil) : null,
    trialEndsAt: new Date(r.trialEndsAt),
    pendingRequests: Number(r.pendingRequests),
  }))
}

// ---------------------------------------------------------------------------
// Shared grant logic (never exported to clients — actions call this)
// ---------------------------------------------------------------------------

/** Set plan=premium and extend premiumUntil; writes an audit row. */
export async function grantPremium(
  ownerId: string,
  months: number,
  actorId: string
): Promise<Date> {
  const profile = await ensureErpProfile(ownerId)
  const until = nextPremiumUntil(profile.premiumUntil, months, new Date())
  await db
    .update(erpProfiles)
    .set({ plan: "premium", premiumUntil: until, updatedAt: new Date() })
    .where(eq(erpProfiles.ownerId, ownerId))
  await db.insert(erpAuditLogs).values({
    ownerId,
    actorId,
    entity: "settings",
    entityId: ownerId,
    action: "update",
    diff: { premiumGrantedMonths: months, premiumUntil: until.toISOString() },
  })
  return until
}
