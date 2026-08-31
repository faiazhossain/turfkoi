import { pgTable, pgEnum, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core"

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
