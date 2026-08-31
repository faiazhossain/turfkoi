import { pgTable, uuid, timestamp, integer, text, index, primaryKey } from "drizzle-orm/pg-core"

import {
  matchState,
  matchType,
  resultStatus,
  matchPlayerRole,
  matchSide,
  requestStatus,
  squadRole,
  invitationStatus,
} from "./enums"
import { users } from "./users"
import { teams } from "./teams"
import { bookings } from "./bookings"

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // 1:1 with bookings.
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" })
      .unique(),
    // The match captain: the user who created the match (solo or team side).
    // RESTRICT — deletion is soft with a grace period, so a user purge must
    // never silently destroy a confirmed match.
    captainId: uuid("captain_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: matchState("state").notNull().default("draft"),
    matchType: matchType("match_type").notNull().default("fives"),
    // Total squad size per SIDE (solo match = the single side; team-vs-team =
    // each side fields its own squad of this size). Includes substitutes —
    // never implied by matchType (format is on-field count only).
    squadSize: integer("squad_size"),
    // Count-first matchmaking: un-named seats the captain claims on the SOLO
    // side ("আমার ৭ জন player আছে") without match_players/match_guests rows.
    // Identities fill in progressively later. Team sides store their own count
    // in match_teams.placeholder_count.
    placeholderCount: integer("placeholder_count").notNull().default(0),
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
  },
  (t) => [index("matches_captain_idx").on(t.captainId)]
)

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
    // Same as matches.placeholder_count but per TEAM side (home/away) — each
    // captain independently declares how many un-named players they have.
    placeholderCount: integer("placeholder_count").notNull().default(0),
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
    // Starting XI vs bench for this match. Defaults to starting so legacy
    // rows (pre-squad) stay on the field.
    squadRole: squadRole("squad_role").notNull().default("starting"),
    // F2: "I played" confirmation — set when the player confirms attendance
    // after the match. Null until confirmed.
    playedConfirmedAt: timestamp("played_confirmed_at", { withTimezone: true }),
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

/**
 * Outbound match invitations (captain → player). Opposite direction of
 * player_requests (which are player → captain); the two tables deliberately
 * coexist — merging them buys nothing and touches live flows.
 *
 * Exactly one of inviteeUserId / inviteePhone must be set (enforced in the
 * invite action). Phone invites are linked to a user on signup by
 * linkMatchInvitationsAndGuests — linking never auto-accepts.
 */
export const matchInvitations = pgTable(
  "match_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    // null for solo matches.
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "cascade",
    }),
    inviteeUserId: uuid("invitee_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    inviteePhone: text("invitee_phone"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    squadRoleWanted: squadRole("squad_role_wanted")
      .notNull()
      .default("starting"),
    status: invitationStatus("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("match_invitations_match_idx").on(t.matchId),
    index("match_invitations_invitee_idx").on(t.inviteeUserId),
    index("match_invitations_phone_idx").on(t.inviteePhone),
  ]
)

/**
 * Temporary (account-less) squad members added manually by the organizer —
 * name + optional phone. Kept out of match_players (whose PK requires a
 * userId). When someone later registers with the same phone,
 * linkMatchInvitationsAndGuests records the identity on linked_user_id.
 */
export const matchGuests = pgTable(
  "match_guests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    // null for solo matches.
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    phone: text("phone"),
    linkedUserId: uuid("linked_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    squadRole: squadRole("squad_role").notNull().default("starting"),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("match_guests_match_idx").on(t.matchId),
    index("match_guests_phone_idx").on(t.phone),
  ]
)
