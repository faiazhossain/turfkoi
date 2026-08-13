import { eq } from "drizzle-orm"

import { db } from "@/db"
import { users, userRoles, playerProfiles } from "@/db/schema"
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
 * Find-or-create a user by phone. Resilient to races and partial creates
 * (neon-http has no multi-statement transactions), via unique(phone) + idempotent
 * backfill of profile + role.
 */
export async function findOrCreateUserByPhone(phone: string): Promise<{
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
