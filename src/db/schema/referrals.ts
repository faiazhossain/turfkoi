import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

import { users } from "./users"

/**
 * A3 — referral growth loop (minimal MVP scaffold; reward accounting is P1).
 *
 * Each user gets one stable referral code. Sharing `/invite/<code>` stamps a
 * cookie; when the invitee signs up we record the link in `referrals`. P1 will
 * add platform-fee credit / payout wiring on top of this table.
 */
export const referralCodes = pgTable(
  "referral_codes",
  {
    // 6-char human-friendly code (unambiguous alphabet).
    code: text("code").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("referral_codes_user_idx").on(t.userId)]
)

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Unique: an invitee can be attributed to exactly one referrer.
    referredUserId: uuid("referred_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("referrals_referrer_idx").on(t.referrerUserId)]
)
