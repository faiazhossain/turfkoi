import { sql } from "drizzle-orm"

import { db } from "@/db"

/**
 * Presence (Player Network): "online" = the player was seen browsing a
 * signed-in page within the last 5 minutes (see lib/presence for the pure
 * helpers used by the UI). The WHERE guard makes repeat calls cheap — the
 * row is only written when the timestamp is >4 min stale. Called from small
 * server components (PresenceTouch), never client-side.
 */
export { PRESENCE_ONLINE_WINDOW_MINUTES } from "@/lib/presence"

export async function touchPresence(userId: string): Promise<void> {
  await db.execute(sql`
    UPDATE player_profiles
    SET last_seen_at = now()
    WHERE user_id = ${userId}
      AND (last_seen_at IS NULL OR last_seen_at < now() - interval '4 minutes')
  `)
}
