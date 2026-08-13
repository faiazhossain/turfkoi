import "server-only"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { users, playerProfiles, userRoles } from "@/db/schema"
import { logger } from "@/lib/logger"

/**
 * K3 — full account deletion workflow. A 14-day grace window starts when the
 * user requests deletion (see `requestAccountDeletionAction`); during that
 * window `users.status = 'deleted'` and they can't sign in normally. After the
 * grace window, the Inngest `account-hard-anonymize` job calls this function.
 *
 * Anonymization rules (per audit K3):
 *   - name, email, phone: PII → erased / replaced with a non-reversible label
 *   - phone becomes `deleted:<sha256(id)>@local` so the unique constraint still
 *     holds but the original number is unrecoverable
 *   - audit_logs.actor_id is intentionally NOT anonymized (audit history
 *     survives user deletion); the row carries no PII besides the hashed id
 *
 * We keep one `player` role row so legacy FK references resolve to a clearly
 * "deleted" user. All other roles are dropped.
 */
export async function anonymizeUser(userId: string): Promise<void> {
  const hash = createHash("sha256")
    .update(userId + "|" + (process.env.AUTH_SECRET ?? ""))
    .digest("hex")
    .slice(0, 16)
  const placeholderPhone = `deleted:${hash}@local`

  await db
    .update(users)
    .set({
      name: null,
      email: null,
      phone: placeholderPhone,
      status: "deleted",
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  // Clear the player profile's PII (coords, area) but keep the row.
  await db
    .update(playerProfiles)
    .set({
      position: null,
      skill: null,
      area: null,
      coords: null,
      available: false,
      availableAt: null,
      updatedAt: new Date(),
    })
    .where(eq(playerProfiles.userId, userId))

  // Drop every role except a single `player` row so FKs resolve.
  await db
    .delete(userRoles)
    .where(eq(userRoles.userId, userId))
  await db
    .insert(userRoles)
    .values({ userId, role: "player" })
    .onConflictDoNothing()

  logger.info("account.anonymized", { userId })
}
