import { pgTable, uuid, timestamp, integer, primaryKey } from "drizzle-orm/pg-core"

import {
  matchState,
  matchType,
  resultStatus,
  matchPlayerRole,
  matchSide,
  requestStatus,
} from "./enums"
import { users } from "./users"
import { teams } from "./teams"
import { bookings } from "./bookings"

export const matches = pgTable("matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  // 1:1 with bookings.
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" })
    .unique(),
  state: matchState("state").notNull().default("draft"),
  matchType: matchType("match_type").notNull().default("fives"),
  // F1: result fields - back the ONGOING -> COMPLETED (result submitted) transition.
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  resultStatus: resultStatus("result_status").notNull().default("pending"),
  submittedBy: uuid("submitted_by").references(() => users.id, {
    onDelete: "set null",
  }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const matchTeams = pgTable(
  "match_teams",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    side: matchSide("side").notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.teamId] })]
)

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    role: matchPlayerRole("role").notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })]
)

export const playerRequests = pgTable(
  "player_requests",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: requestStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })]
)

export const opponentRequests = pgTable(
  "opponent_requests",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    status: requestStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.teamId] })]
)
