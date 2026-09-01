import { eq } from "drizzle-orm"

import { db } from "@/db"
import { playerProfiles, users } from "@/db/schema"

import { generatePlayerId, suggestUsername } from "./username"

/**
 * DB-side player identity (Player Network): idempotently ensures every
 * profile has its permanent public Player ID (DT-XXXXXX) + unique @username.
 * Pure helpers live in username.ts.
 */

/**
 * Idempotently fill player_id and username for a profile (each retrying on
 * the rare unique collision). Called from ensureProfileAndRole so every
 * registered player gets one at signup; the backfill script covers legacy
 * rows with the same rules.
 */
export async function ensurePlayerIdentity(userId: string): Promise<void> {
  const [profile] = await db
    .select({ playerId: playerProfiles.playerId, username: playerProfiles.username })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId))
    .limit(1)
  if (!profile) return

  if (!profile.playerId) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const playerId = generatePlayerId()
      const rows = await db
        .update(playerProfiles)
        .set({ playerId })
        .where(eq(playerProfiles.userId, userId))
        .returning({ playerId: playerProfiles.playerId })
      if (rows[0]?.playerId === playerId) break
    }
  }

  if (!profile.username) {
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = suggestUsername(user?.name ?? null)
      const rows = await db
        .update(playerProfiles)
        .set({ username })
        .where(eq(playerProfiles.userId, userId))
        .returning({ username: playerProfiles.username })
      if (rows[0]?.username === username) break
    }
  }
}
