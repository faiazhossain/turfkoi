import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { turfs } from "./turfs"
import { users } from "./users"

/**
 * Single-use invite links that let a real-world turf owner claim an
 * admin-seeded turf (`turfs.owner_id IS NULL`). Tokens are 43-char
 * base64url (32 bytes of entropy) and stored sha256-hashed, matching the
 * otp table posture - a claim grants ownership, so no short codes here.
 *
 * One active invite per turf (partial unique index); creating a new invite
 * revokes the previous one so leaked links die. Rows are kept after
 * claim/revoke as an audit trail.
 */
export const turfClaimInvites = pgTable(
  "turf_claim_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    // Optional; only used to pre-fill email delivery. Not a constraint -
    // anyone holding the link may claim (the link itself is the proof).
    targetEmail: text("target_email"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: uuid("claimed_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("turf_claim_invites_token_hash_idx").on(t.tokenHash),
    // At most one unclaimed, unrevoked invite per turf.
    uniqueIndex("turf_claim_invites_active_turf_idx")
      .on(t.turfId)
      .where(sql`claimed_at IS NULL AND revoked_at IS NULL`),
  ]
)
