import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { users } from "./users"

/**
 * One-time 6-digit sign-in codes an admin mints for a turf owner (support
 * tool: owner forgot their password or their login looks off). The admin
 * relays the code over WhatsApp; phone + code jointly prove identity, so
 * the code acts as a one-time password — the user's real password is
 * rotated at sign-in and immediately replaced by the set-password step.
 *
 * Only sha256 hashes are stored. Codes are single-use, attempt-limited
 * (5 misses → 15-minute lock), and short-lived (15 minutes). One active
 * code per phone — minting a new one revokes the previous. Rows are kept
 * after consume/revoke as an audit trail.
 */
export const ownerLoginCodes = pgTable(
  "owner_login_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Normalized (+8801…). The account already exists (owned turf's owner);
    // the user row is resolved at verify time.
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Admin who minted the code.
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("owner_login_codes_phone_idx").on(t.phone),
    // At most one unconsumed, unrevoked code per phone.
    uniqueIndex("owner_login_codes_active_phone_idx")
      .on(t.phone)
      .where(sql`consumed_at IS NULL AND revoked_at IS NULL`),
  ]
)
