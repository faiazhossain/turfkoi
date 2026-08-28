import { eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { erpProfiles, turfs } from "@/db/schema"
import { trialDaysLeft } from "./finance"

export type ErpProfile = typeof erpProfiles.$inferSelect

export type ErpTier = "trial" | "premium" | "free"

export interface ErpPlanState {
  tier: ErpTier
  /** Trial days remaining (0 when not in trial). */
  trialDaysLeft: number
  trialEndsAt: Date
  isPremiumFeaturesUnlocked: boolean
}

/**
 * Lazy-create the owner's ERP profile. The trial is anchored to the owner's
 * platform lifecycle — the earliest owned turf (covers the claim flow and
 * self-created turfs) — never to first ERP open (PRD §6).
 */
export async function ensureErpProfile(ownerId: string): Promise<ErpProfile> {
  const existing = await db
    .select()
    .from(erpProfiles)
    .where(eq(erpProfiles.ownerId, ownerId))
    .limit(1)
  if (existing[0]) return existing[0]

  const [anchor] = await db
    .select({ firstTurf: sql<Date | null>`MIN(${turfs.createdAt})` })
    .from(turfs)
    .where(eq(turfs.ownerId, ownerId))

  const start = anchor?.firstTurf ? new Date(anchor.firstTurf) : new Date()
  const trialStartsAt = start
  const trialEndsAt = new Date(start.getTime() + 60 * 86_400_000)

  await db
    .insert(erpProfiles)
    .values({ ownerId, trialStartsAt, trialEndsAt })
    .onConflictDoNothing()

  const [created] = await db
    .select()
    .from(erpProfiles)
    .where(eq(erpProfiles.ownerId, ownerId))
    .limit(1)
  return created
}

export function getErpPlanState(
  profile: ErpProfile,
  now: Date = new Date()
): ErpPlanState {
  const daysLeft = trialDaysLeft(profile.trialEndsAt, now)
  const premiumActive =
    profile.plan === "premium" &&
    profile.premiumUntil !== null &&
    profile.premiumUntil > now
  return {
    tier: premiumActive ? "premium" : now < profile.trialEndsAt ? "trial" : "free",
    trialDaysLeft: daysLeft,
    trialEndsAt: profile.trialEndsAt,
    isPremiumFeaturesUnlocked: premiumActive || now < profile.trialEndsAt,
  }
}
