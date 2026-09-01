import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core"

import { users } from "./users"
import { friendshipStatus } from "./enums"

/**
 * Friends: a single table covering the whole lifecycle — a row starts as a
 * pending request and flips to accepted/declined. Friendship is the pair
 * (either direction) with status accepted. The pair index gives O(1) dedupe;
 * the actions additionally block self-requests and reverse-pending dupes.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("friendships_pair_idx").on(t.requesterId, t.addresseeId),
    index("friendships_addressee_idx").on(t.addresseeId),
  ]
)

/**
 * Blocking: one row per direction (blocker → blocked). Interactions between
 * two users are blocked if a row exists in EITHER direction. Blocking also
 * deletes any friendship row between the pair (actions.ts), but rows are
 * kept independent of friendships so unblocking restores normal rules.
 */
export const userBlocks = pgTable(
  "user_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("user_blocks_pair_idx").on(t.blockerId, t.blockedId),
    index("user_blocks_blocked_idx").on(t.blockedId),
  ]
)
