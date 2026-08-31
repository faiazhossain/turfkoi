import "server-only"
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/db"
import {
  matches,
  matchTeams,
  matchPlayers,
  matchInvitations,
  matchGuests,
  bookings,
  turfs,
  teams,
  users,
} from "@/db/schema"
import { getTeamRole } from "@/features/teams/queries"
import { dedupeRecentGuests, type RecentGuestPick } from "./guests"
import { isCaptainRole, type Side } from "./authority"

export type MatchDetail = Awaited<ReturnType<typeof getMatch>>

export async function getMatch(id: string) {
  const awayCaptain = alias(users, "away_captain")
  const rows = await db
    .select({
      match: matches,
      booking: bookings,
      turf: turfs,
      awayCaptainName: awayCaptain.name,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .leftJoin(awayCaptain, eq(awayCaptain.id, matches.awayCaptainId))
    .where(eq(matches.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  // Legacy team sides — old matches render their team name as the side label.
  const sides = await db
    .select({
      teamId: matchTeams.teamId,
      side: matchTeams.side,
      teamName: teams.name,
      teamSlug: teams.slug,
    })
    .from(matchTeams)
    .innerJoin(teams, eq(teams.id, matchTeams.teamId))
    .where(eq(matchTeams.matchId, id))

  const roster = await db
    .select({
      userId: users.id,
      name: users.name,
      phone: users.phone,
      side: matchPlayers.side,
      role: matchPlayers.role,
      squadRole: matchPlayers.squadRole,
    })
    .from(matchPlayers)
    .innerJoin(users, eq(users.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, id))

  return { ...row, sides, roster }
}

export type SideCounts = {
  side: Side
  /** Legacy team name shown as the side label (pre-person-based matches). */
  legacyTeamLabel: string | null
  /** Identities: registered players + guests. */
  total: number
  starting: number
  substitute: number
  /** Outstanding invitations — prospects, not seat reservations. */
  pending: number
  /** Un-named seats declared count-first ("আমার ৭ জন আছে"). */
  placeholders: number
  /** total + placeholders — claimed seats; what fills the squad. */
  filled: number
}

/**
 * Per-side squad composition. Registered players AND guests count toward the
 * squad; pending invitations do NOT — seats are claimed first-accept-wins, so
 * a side may hold more invites than open seats. Count-first placeholders
 * fill the squad: home lives on matches.placeholderCount, away on
 * matches.awayPlaceholderCount (legacy team rows were backfilled there).
 * The home side always exists; away appears once claimed or once it has any
 * identities/pending (legacy away teams come in through the backfilled side
 * columns).
 */
export async function getSquadCounts(matchId: string): Promise<SideCounts[]> {
  const [playerRows, guestRows, pendingRows, labelRows, matchRow] =
    await Promise.all([
      db
        .select({
          side: matchPlayers.side,
          squadRole: matchPlayers.squadRole,
          count: sql<number>`count(*)::int`,
        })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, matchId))
        .groupBy(matchPlayers.side, matchPlayers.squadRole),
      db
        .select({
          side: matchGuests.side,
          squadRole: matchGuests.squadRole,
          count: sql<number>`count(*)::int`,
        })
        .from(matchGuests)
        .where(eq(matchGuests.matchId, matchId))
        .groupBy(matchGuests.side, matchGuests.squadRole),
      db
        .select({
          side: matchInvitations.side,
          count: sql<number>`count(*)::int`,
        })
        .from(matchInvitations)
        .where(
          and(
            eq(matchInvitations.matchId, matchId),
            eq(matchInvitations.status, "pending")
          )
        )
        .groupBy(matchInvitations.side),
      db
        .select({ side: matchTeams.side, teamName: teams.name })
        .from(matchTeams)
        .innerJoin(teams, eq(teams.id, matchTeams.teamId))
        .where(eq(matchTeams.matchId, matchId)),
      db
        .select({
          placeholderCount: matches.placeholderCount,
          awayPlaceholderCount: matches.awayPlaceholderCount,
          awayCaptainId: matches.awayCaptainId,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1),
    ])

  const bySide = new Map<Side, SideCounts>()
  const entryFor = (side: Side): SideCounts => {
    const existing = bySide.get(side) ?? {
      side,
      legacyTeamLabel:
        labelRows.find((l) => l.side === side)?.teamName ?? null,
      total: 0,
      starting: 0,
      substitute: 0,
      pending: 0,
      placeholders: 0,
      filled: 0,
    }
    bySide.set(side, existing)
    return existing
  }
  for (const r of [...playerRows, ...guestRows]) {
    const entry = entryFor(r.side)
    entry.total += r.count
    if (r.squadRole === "starting") entry.starting += r.count
    else entry.substitute += r.count
  }
  for (const r of pendingRows) {
    entryFor(r.side).pending += r.count
  }

  const result = [bySide.get("home") ?? entryFor("home")]
  if (bySide.has("away") || matchRow[0]?.awayCaptainId != null) {
    result.push(bySide.get("away") ?? entryFor("away"))
  }
  for (const entry of result) {
    entry.placeholders =
      entry.side === "home"
        ? (matchRow[0]?.placeholderCount ?? 0)
        : (matchRow[0]?.awayPlaceholderCount ?? 0)
    entry.filled = entry.total + entry.placeholders
  }
  return result
}

/** Starting-group size for one side (players + guests). */
export async function countStarting(
  matchId: string,
  side: Side
): Promise<number> {
  const [playerRows, guestRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchPlayers)
      .where(
        and(
          eq(matchPlayers.matchId, matchId),
          eq(matchPlayers.squadRole, "starting"),
          eq(matchPlayers.side, side)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchGuests)
      .where(
        and(
          eq(matchGuests.matchId, matchId),
          eq(matchGuests.squadRole, "starting"),
          eq(matchGuests.side, side)
        )
      ),
  ])
  return (playerRows[0]?.count ?? 0) + (guestRows[0]?.count ?? 0)
}

/**
 * Which side (if any) the user manages: home = match creator, away = the
 * opponent-side claimant. Legacy team-based matches fall back to team roles
 * on match_teams sides. Null = no authority over either side. Shared by the
 * match and player action modules.
 */
export async function resolveSideCaptain(
  match: typeof matches.$inferSelect,
  userId: string
): Promise<Side | null> {
  if (match.captainId === userId) return "home"
  if (match.awayCaptainId !== null && match.awayCaptainId === userId) {
    return "away"
  }
  const sides = await db
    .select({ side: matchTeams.side, teamId: matchTeams.teamId })
    .from(matchTeams)
    .where(eq(matchTeams.matchId, match.id))
  for (const s of sides) {
    const role = await getTeamRole(s.teamId, userId)
    if (isCaptainRole(role)) return s.side
  }
  return null
}

export type OpenMatchCard = {
  id: string
  matchType: string
  squadSize: number | null
  kickoffAt: Date | null
  captainId: string
  captainName: string | null
  awayCaptainId: string | null
  awayCaptainName: string | null
  legacyHomeTeamName: string | null
  turfName: string
  turfArea: string | null
  turfCity: string | null
  turfSlug: string
  date: string
  slotStart: string
  homeFilled: number
  awayFilled: number
}

/**
 * Open matches for discovery — every open match wants an opponent side
 * claim, and its fill counts advertise how many players are still needed.
 */
export async function listOpenMatches(limit = 30): Promise<OpenMatchCard[]> {
  const captain = alias(users, "captain")
  const awayCaptain = alias(users, "away_captain")
  const rows = await db
    .select({
      id: matches.id,
      matchType: matches.matchType,
      squadSize: matches.squadSize,
      placeholderCount: matches.placeholderCount,
      awayPlaceholderCount: matches.awayPlaceholderCount,
      awayCaptainId: matches.awayCaptainId,
      kickoffAt: matches.kickoffAt,
      captainId: matches.captainId,
      captainName: captain.name,
      awayCaptainName: awayCaptain.name,
      turfName: turfs.name,
      turfArea: turfs.area,
      turfCity: turfs.city,
      turfSlug: turfs.slug,
      date: bookings.date,
      slotStart: bookings.slotStart,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(captain, eq(captain.id, matches.captainId))
    .leftJoin(awayCaptain, eq(awayCaptain.id, matches.awayCaptainId))
    .where(eq(matches.state, "open"))
    .orderBy(asc(matches.kickoffAt))
    .limit(limit)

  if (rows.length === 0) return []

  const matchIds = rows.map((r) => r.id)
  const [playerRows, guestRows, teamRows] = await Promise.all([
    db
      .select({ matchId: matchPlayers.matchId, side: matchPlayers.side })
      .from(matchPlayers)
      .where(inArray(matchPlayers.matchId, matchIds)),
    db
      .select({ matchId: matchGuests.matchId, side: matchGuests.side })
      .from(matchGuests)
      .where(inArray(matchGuests.matchId, matchIds)),
    db
      .select({
        matchId: matchTeams.matchId,
        side: matchTeams.side,
        teamName: teams.name,
      })
      .from(matchTeams)
      .innerJoin(teams, eq(teams.id, matchTeams.teamId))
      .where(inArray(matchTeams.matchId, matchIds)),
  ])

  return rows.map((r) => {
    // Claimed seats only — pending invitations are prospects, not
    // reservations, so they don't advertise a side as fuller than it is.
    const filledFor = (side: Side) =>
      playerRows.filter((p) => p.matchId === r.id && p.side === side).length +
      guestRows.filter((g) => g.matchId === r.id && g.side === side).length +
      (side === "home" ? r.placeholderCount : r.awayPlaceholderCount)
    return {
      id: r.id,
      matchType: r.matchType,
      squadSize: r.squadSize,
      kickoffAt: r.kickoffAt,
      captainId: r.captainId,
      captainName: r.captainName,
      awayCaptainId: r.awayCaptainId,
      awayCaptainName: r.awayCaptainName,
      legacyHomeTeamName:
        teamRows.find((t) => t.matchId === r.id && t.side === "home")
          ?.teamName ?? null,
      turfName: r.turfName,
      turfArea: r.turfArea,
      turfCity: r.turfCity,
      turfSlug: r.turfSlug,
      date: r.date,
      slotStart: r.slotStart,
      homeFilled: filledFor("home"),
      awayFilled: filledFor("away"),
    }
  })
}

/** Pending outbound invitations for a match — shown to its managers. */
export async function listPendingInvitationsByMatch(matchId: string) {
  return db
    .select({
      id: matchInvitations.id,
      side: matchInvitations.side,
      inviteeUserId: matchInvitations.inviteeUserId,
      inviteePhone: matchInvitations.inviteePhone,
      playerName: users.name,
      playerPhone: users.phone,
      squadRoleWanted: matchInvitations.squadRoleWanted,
      createdAt: matchInvitations.createdAt,
    })
    .from(matchInvitations)
    .leftJoin(users, eq(users.id, matchInvitations.inviteeUserId))
    .where(
      and(eq(matchInvitations.matchId, matchId), eq(matchInvitations.status, "pending"))
    )
    .orderBy(asc(matchInvitations.createdAt))
}

/** Pending invitations addressed to a user (linked phone invites included). */
export async function listMyPendingInvitations(userId: string) {
  return db
    .select({
      id: matchInvitations.id,
      matchId: matchInvitations.matchId,
      side: matchInvitations.side,
      squadRoleWanted: matchInvitations.squadRoleWanted,
      invitedByName: users.name,
      invitedByPhone: users.phone,
      matchType: matches.matchType,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfName: turfs.name,
      turfArea: turfs.area,
    })
    .from(matchInvitations)
    .innerJoin(matches, eq(matches.id, matchInvitations.matchId))
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(users, eq(users.id, matchInvitations.invitedBy))
    .where(
      and(
        eq(matchInvitations.inviteeUserId, userId),
        eq(matchInvitations.status, "pending")
      )
    )
    .orderBy(asc(matchInvitations.createdAt))
}

/** Guests (temp players) for a match, in squad order. */
export async function listMatchGuests(matchId: string) {
  return db
    .select({
      id: matchGuests.id,
      side: matchGuests.side,
      name: matchGuests.name,
      phone: matchGuests.phone,
      position: matchGuests.position,
      jerseyNumber: matchGuests.jerseyNumber,
      linkedUserId: matchGuests.linkedUserId,
      squadRole: matchGuests.squadRole,
    })
    .from(matchGuests)
    .where(eq(matchGuests.matchId, matchId))
    .orderBy(asc(matchGuests.createdAt))
}

/**
 * Quick-add picks for the guest form: the players this captain personally
 * added to previous matches, most recent first, deduped by identity
 * (normalized phone, else name).
 */
export async function listRecentGuestsAddedBy(
  adderId: string,
  excludeMatchId?: string,
  limit = 8
): Promise<RecentGuestPick[]> {
  const rows = await db
    .select({
      name: matchGuests.name,
      phone: matchGuests.phone,
      position: matchGuests.position,
      jerseyNumber: matchGuests.jerseyNumber,
    })
    .from(matchGuests)
    .where(
      excludeMatchId
        ? and(
            eq(matchGuests.addedBy, adderId),
            ne(matchGuests.matchId, excludeMatchId)
          )
        : eq(matchGuests.addedBy, adderId)
    )
    .orderBy(desc(matchGuests.createdAt))
    .limit(60)
  return dedupeRecentGuests(rows, limit)
}
