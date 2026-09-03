import { sql } from "drizzle-orm"
import { pgTable, uuid, timestamp, integer, text, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"

import {
  matchState,
  matchType,
  resultStatus,
  matchPlayerRole,
  matchSide,
  matchEventType,
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
    // The home captain: the user who created the match. RESTRICT — deletion
    // is soft with a grace period, so a user purge must never silently
    // destroy a confirmed match.
    captainId: uuid("captain_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // The away captain: the player who claimed the opponent side (person-based
    // FCFS — set by a conditional update that also flips state to confirmed).
    // Null while the match is open (opponent wanted).
    awayCaptainId: uuid("away_captain_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    // Assigned live-event logger (a captain may delegate logging to any
    // registered roster player). Cleared when the user is hard-anonymized —
    // authority then collapses back to the captains.
    recorderId: uuid("recorder_id").references(() => users.id, {
      onDelete: "set null",
    }),
    state: matchState("state").notNull().default("draft"),
    matchType: matchType("match_type").notNull().default("fives"),
    // Total squad size per SIDE (solo match = the single side; team-vs-team =
    // each side fields its own squad of this size). Includes substitutes —
    // never implied by matchType (format is on-field count only).
    squadSize: integer("squad_size"),
    // Count-first matchmaking: un-named seats the HOME captain claims
    // ("আমার ৭ জন player আছে") without match_players/match_guests rows.
    // Identities fill in progressively later. The away side's declared count
    // lives in away_placeholder_count. Legacy team sides keep their count in
    // match_teams.placeholder_count (reads only).
    placeholderCount: integer("placeholder_count").notNull().default(0),
    // Count-first for the away side: un-named seats the away captain claims
    // when they take the opponent side for their own group.
    awayPlaceholderCount: integer("away_placeholder_count")
      .notNull()
      .default(0),
    // F1: result fields - back the ONGOING -> COMPLETED (result submitted) transition.
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    resultStatus: resultStatus("result_status").notNull().default("pending"),
    submittedBy: uuid("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    // Short public token for the shareable invite link (/m/<token>) shown in
    // the match room — identifies the match without exposing the uuid in
    // shared chats. Not a secret: it only gates discovery convenience.
    shareToken: text("share_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("matches_captain_idx").on(t.captainId),
    index("matches_away_captain_idx").on(t.awayCaptainId),
    uniqueIndex("matches_share_token_idx").on(t.shareToken),
  ]
)

/**
 * Legacy team sides (matches created before teams left the match flow).
 * Read-only: new matches never write here — sides are the `side` column on
 * match_players / match_guests / match_invitations. Kept so old matches
 * still render their team names and remain manageable.
 */
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
    // Same as matches.placeholder_count but per legacy TEAM side (home/away).
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
    // home = creator side, away = claimed opponent side. Legacy team rows
    // were backfilled from match_teams.side (migration 0024).
    side: matchSide("side").notNull().default("home"),
    // Legacy team-based matches only; null for person-based sides.
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

/**
 * Team challenges: a nearby team (sent by one of its captain-role members)
 * challenges an open match as a unit. While the challenge is pending the
 * match stays open — the home captain accepts ONE challenge (or a person
 * claims the side first; both land through the same atomic away-side claim),
 * and every other pending challenge is auto-cancelled on acceptance.
 * Rows from the legacy team-sides era are indistinguishable in shape and
 * render through the same UI.
 */
export const opponentRequests = pgTable(
  "opponent_requests",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // The team member who sent the challenge — becomes the away captain on
    // acceptance. Null only for legacy rows.
    sentBy: uuid("sent_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: requestStatus("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.teamId] }),
    // One live challenge per team per match — a rejected team may re-challenge
    // by flipping the row back to pending (upsert path in the action).
    index("opponent_requests_match_status_idx").on(t.matchId, t.status),
  ]
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
    // Side the invite seats the player on (the inviter's side).
    side: matchSide("side").notNull().default("home"),
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
    // One PENDING invite per (match, side, invitee) — the app-level pre-check
    // is best-effort; these partial uniques make concurrent dupes impossible.
    uniqueIndex("match_invitations_user_pending")
      .on(t.matchId, t.side, t.inviteeUserId)
      .where(sql`status = 'pending' AND invitee_user_id IS NOT NULL`),
    uniqueIndex("match_invitations_phone_pending")
      .on(t.matchId, t.side, t.inviteePhone)
      .where(sql`status = 'pending' AND invitee_phone IS NOT NULL`),
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
    // Side this guest plays on (the adder's side).
    side: matchSide("side").notNull().default("home"),
    name: text("name").notNull(),
    phone: text("phone"),
    // Canonical position id (POSITION_IDS); plain text like player_profiles
    // so legacy free text still renders. Writes go through Zod.
    position: text("position"),
    // 0..99 (CHECK via migration 0025). Null = no number recorded.
    jerseyNumber: integer("jersey_number"),
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

/**
 * Live event log ("who scored / who saved / who tackled" + commentary),
 * written by a captain or the assigned recorder while the match is ongoing.
 * Names are snapshotted at write time — users.name is nulled by account
 * anonymization, and the historical log must survive that. The side is
 * derived server-side from the resolved roster row, never trusted from the
 * client; player-less notes leave it null.
 */
export const matchEvents = pgTable(
  "match_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    // Side of the event's player; null for player-less notes.
    side: matchSide("side"),
    eventType: matchEventType("event_type").notNull(),
    // Snapshot at write time: floor((now - kickoffAt) / 60000), clamped >= 0
    // (captains may start early). Never recomputed — the log must not drift
    // after the fact. Null when the match has no kickoffAt.
    minute: integer("minute"),
    // Exactly one of player_user_id / player_guest_id for stat events; both
    // null for pure commentary.
    playerUserId: uuid("player_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    playerGuestId: uuid("player_guest_id")
      .references(() => matchGuests.id, { onDelete: "cascade" }),
    // Display-name snapshot at write time (user name or masked phone /
    // guest name) so the timeline outlives anonymization and roster edits.
    playerName: text("player_name"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("match_events_match_idx").on(t.matchId, t.createdAt)]
)
