import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
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
 *
 * When target_phone is set, the invite also carries a one-time 6-digit OTP
 * (sha256-hashed) so the owner can sign in straight from the WhatsApp
 * message the admin forwards: link + code together are the proof. The OTP
 * shares the invite's expiry and dies with re-invites/revoke.
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
    // Normalized (+8801…). When set, an OTP login flow is offered on the
    // claim page instead of the manual sign-in/register links.
    targetPhone: text("target_phone"),
    otpHash: text("otp_hash"),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    otpLockedUntil: timestamp("otp_locked_until", { withTimezone: true }),
    otpConsumedAt: timestamp("otp_consumed_at", { withTimezone: true }),
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
