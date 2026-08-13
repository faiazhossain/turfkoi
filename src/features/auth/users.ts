import { eq, and, isNull } from "drizzle-orm"

import { db } from "@/db"
import { users, userRoles, playerProfiles, teamMembers, teamInvitations } from "@/db/schema"
import type { Role } from "@/lib/capabilities"

export async function getUserByPhone(phone: string) {
  const rows = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  return rows[0] ?? null
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const rows = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return rows.map((r) => r.role as Role)
}

/** Idempotent: ensures a player profile + default 'player' role exist. */
async function ensureProfileAndRole(userId: string): Promise<void> {
  await db.insert(playerProfiles).values({ userId }).onConflictDoNothing()
  await db
    .insert(userRoles)
    .values({ userId, role: "player" })
    .onConflictDoNothing()
}

/**
 * Phase 4: when a user signs up, fulfill any pending team invitations that
 * match their phone. Each fulfilled invite creates a team_members row and
 * marks the invitation as fulfilled (idempotent).
 */
async function fulfillPendingInvitations(userId: string, phone: string): Promise<void> {
  const pending = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.phone, phone),
        isNull(teamInvitations.fulfilledAt)
      )
    )
  if (pending.length === 0) return

  for (const inv of pending) {
    await db
      .insert(teamMembers)
      .values({ teamId: inv.teamId, userId, role: inv.role })
      .onConflictDoNothing()
    await db
      .update(teamInvitations)
      .set({ fulfilledAt: new Date() })
      .where(eq(teamInvitations.id, inv.id))
  }
}

/**
 * Find-or-create a user by phone. Resilient to races and partial creates
 * (neon-http has no multi-statement transactions), via unique(phone) + idempotent
 * backfill of profile + role.
 *
 * `refCode` (Phase 8 / A3) attributes a new signup to a referrer. It is a no-op
 * for existing users and on invalid / self-referral codes.
 */
export async function findOrCreateUserByPhone(
  phone: string,
  refCode?: string
): Promise<{
  user: { id: string; phone: string; name: string | null }
  isNew: boolean
}> {
  const existing = await getUserByPhone(phone)
  if (existing) {
    await ensureProfileAndRole(existing.id)
    return { user: existing, isNew: false }
  }
  try {
    const [created] = await db.insert(users).values({ phone }).returning()
    await ensureProfileAndRole(created.id)
    // Fulfill any pending team invitations for this phone number.
    await fulfillPendingInvitations(created.id, phone)
    // Attribute the signup to a referrer if a valid code was supplied.
    if (refCode) {
      const { attributeReferral } = await import("./referrals")
      await attributeReferral(refCode, created.id).catch(() => {
        /* non-fatal */
      })
    }
    return { user: created, isNew: true }
  } catch (err) {
    // unique(phone) race: another request created it first.
    const again = await getUserByPhone(phone)
    if (again) {
      await ensureProfileAndRole(again.id)
      return { user: again, isNew: false }
    }
    throw err
  }
}
