import { pgTable, uuid, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core"

import { teamMemberRole } from "./enums"
import { users } from "./users"

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Ownership lives in team_members(role=owner) ONLY (audit F6) - no
  // denormalized owner_id, which would be a second source of truth.
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamMemberRole("role").notNull().default("player"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })]
)

/**
 * Phone-based team invitations (Phase 4). When a captain enters a phone number:
 *   - If the user exists → added to team_members immediately.
 *   - If not → a row is stored here; findOrCreateUserByPhone fulfills it on
 *     first signup, auto-adding the new user to the team as 'player'.
 *
 * One pending invitation per (team_id, phone) — re-adding a phone is a no-op.
 */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    role: teamMemberRole("role").notNull().default("player"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One pending invite per (team, phone) — dedupes re-adds.
    index("team_invitations_team_phone_idx").on(t.teamId, t.phone),
    index("team_invitations_phone_idx").on(t.phone),
  ]
)
