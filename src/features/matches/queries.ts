import "server-only"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

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

export type MatchDetail = Awaited<ReturnType<typeof getMatch>>

export async function getMatch(id: string) {
  const rows = await db
    .select({
      match: matches,
      booking: bookings,
      turf: turfs,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(eq(matches.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null

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
      teamId: matchPlayers.teamId,
      role: matchPlayers.role,
      squadRole: matchPlayers.squadRole,
    })
    .from(matchPlayers)
    .innerJoin(users, eq(users.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, id))

  return { ...row, sides, roster }
}

export type SquadCounts = {
  teamId: string | null
  /** Identities: registered players + guests. */
  total: number
  starting: number
  substitute: number
  pending: number
  /** Un-named seats declared count-first ("আমার ৭ জন আছে"). */
  placeholders: number
  /** total + pending + placeholders — what fills the squad. */
  filled: number
}[]

/**
 * Per-side squad composition (teamId null = the solo side). Registered
 * players AND guests count toward the squad; pending invitations count so
 * capacity checks can't over-book (a decline/cancel releases the spot).
 * Count-first placeholders (matches.placeholderCount for the solo side,
 * match_teams.placeholderCount for team sides) also fill the squad.
 */
export async function getSquadCounts(matchId: string): Promise<SquadCounts> {
  const [playerRows, guestRows, pendingRows, matchRow, teamRows] =
    await Promise.all([
      db
        .select({
          teamId: matchPlayers.teamId,
          squadRole: matchPlayers.squadRole,
          count: sql<number>`count(*)::int`,
        })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, matchId))
        .groupBy(matchPlayers.teamId, matchPlayers.squadRole),
      db
        .select({
          teamId: matchGuests.teamId,
          squadRole: matchGuests.squadRole,
          count: sql<number>`count(*)::int`,
        })
        .from(matchGuests)
        .where(eq(matchGuests.matchId, matchId))
        .groupBy(matchGuests.teamId, matchGuests.squadRole),
      db
        .select({
          teamId: matchInvitations.teamId,
          count: sql<number>`count(*)::int`,
        })
        .from(matchInvitations)
        .where(
          and(
            eq(matchInvitations.matchId, matchId),
            eq(matchInvitations.status, "pending")
          )
        )
        .groupBy(matchInvitations.teamId),
      db
        .select({ placeholderCount: matches.placeholderCount })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1),
      db
        .select({
          teamId: matchTeams.teamId,
          placeholderCount: matchTeams.placeholderCount,
        })
        .from(matchTeams)
        .where(eq(matchTeams.matchId, matchId)),
    ])

  const soloPlaceholders = matchRow[0]?.placeholderCount ?? 0
  const teamPlaceholders = new Map(
    teamRows.map((t) => [t.teamId, t.placeholderCount])
  )

  const bySquad = new Map<string | null, SquadCounts[number]>()
  const entryFor = (teamId: string | null) => {
    const existing = bySquad.get(teamId) ?? {
      teamId,
      total: 0,
      starting: 0,
      substitute: 0,
      pending: 0,
      placeholders: 0,
      filled: 0,
    }
    bySquad.set(teamId, existing)
    return existing
  }
  for (const r of [...playerRows, ...guestRows]) {
    const entry = entryFor(r.teamId)
    entry.total += r.count
    if (r.squadRole === "starting") entry.starting += r.count
    else entry.substitute += r.count
  }
  for (const r of pendingRows) {
    entryFor(r.teamId).pending += r.count
  }
  const result = [...bySquad.values()]
  // The solo side exists even with zero identities — keep its entry.
  if (teamRows.length === 0) entryFor(null).placeholders = soloPlaceholders
  for (const entry of result) {
    entry.placeholders =
      entry.teamId === null
        ? soloPlaceholders
        : (teamPlaceholders.get(entry.teamId) ?? 0)
    entry.filled = entry.total + entry.pending + entry.placeholders
  }
  return result
}

/** Starting-group size for one side (players + guests; teamId null = solo). */
export async function countStarting(
  matchId: string,
  teamId: string | null
): Promise<number> {
  const [playerRows, guestRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchPlayers)
      .where(
        and(
          eq(matchPlayers.matchId, matchId),
          eq(matchPlayers.squadRole, "starting"),
          teamId ? eq(matchPlayers.teamId, teamId) : isNull(matchPlayers.teamId)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchGuests)
      .where(
        and(
          eq(matchGuests.matchId, matchId),
          eq(matchGuests.squadRole, "starting"),
          teamId ? eq(matchGuests.teamId, teamId) : isNull(matchGuests.teamId)
        )
      ),
  ])
  return (playerRows[0]?.count ?? 0) + (guestRows[0]?.count ?? 0)
}

/** Open matches for discovery — optionally excludes the user's own teams. */
export async function listOpenMatches(excludeTeamIds: string[] = [], limit = 30) {
  const rows = await db
    .select({
      id: matches.id,
      matchType: matches.matchType,
      squadSize: matches.squadSize,
      kickoffAt: matches.kickoffAt,
      captainName: users.name,
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
    .innerJoin(users, eq(users.id, matches.captainId))
    .where(eq(matches.state, "open"))
    .orderBy(asc(matches.kickoffAt))
    .limit(limit)

  if (rows.length === 0) return []

  // Attach the home team for each match.
  const matchIds = rows.map((r) => r.id)
  const teamRows = await db
    .select({
      matchId: matchTeams.matchId,
      teamId: matchTeams.teamId,
      teamName: teams.name,
      teamSlug: teams.slug,
      side: matchTeams.side,
      placeholderCount: matchTeams.placeholderCount,
    })
    .from(matchTeams)
    .innerJoin(teams, eq(teams.id, matchTeams.teamId))
    .where(inArray(matchTeams.matchId, matchIds))

  // Squad fill counts for the hub cards ("8/10"). Open matches only have the
  // creating side, so filled = players + guests + pending invites + the
  // count-first placeholders (solo → matches, team → home match_teams row).
  const rosterCounts = await db
    .select({
      matchId: matchPlayers.matchId,
      count: sql<number>`count(*)::int`,
    })
    .from(matchPlayers)
    .where(inArray(matchPlayers.matchId, matchIds))
    .groupBy(matchPlayers.matchId)
  const [guestCounts, pendingCounts, matchRows] = await Promise.all([
    db
      .select({
        matchId: matchGuests.matchId,
        count: sql<number>`count(*)::int`,
      })
      .from(matchGuests)
      .where(inArray(matchGuests.matchId, matchIds))
      .groupBy(matchGuests.matchId),
    db
      .select({
        matchId: matchInvitations.matchId,
        count: sql<number>`count(*)::int`,
      })
      .from(matchInvitations)
      .where(
        and(
          inArray(matchInvitations.matchId, matchIds),
          eq(matchInvitations.status, "pending")
        )
      )
      .groupBy(matchInvitations.matchId),
    db
      .select({
        id: matches.id,
        placeholderCount: matches.placeholderCount,
      })
      .from(matches)
      .where(inArray(matches.id, matchIds)),
  ])
  const homePlaceholders = new Map(
    teamRows
      .filter((t) => t.side === "home")
      .map((t) => [t.matchId, t.placeholderCount])
  )

  return rows
    .map((r) => {
      const home = teamRows.find(
        (t) => t.matchId === r.id && t.side === "home"
      )
      // Exclude matches where the user's team is the home side.
      if (home && excludeTeamIds.includes(home.teamId)) return null
      const filled =
        (rosterCounts.find((c) => c.matchId === r.id)?.count ?? 0) +
        (guestCounts.find((c) => c.matchId === r.id)?.count ?? 0) +
        (pendingCounts.find((c) => c.matchId === r.id)?.count ?? 0) +
        (matchRows.find((m) => m.id === r.id)?.placeholderCount ?? 0) +
        (homePlaceholders.get(r.id) ?? 0)
      return { ...r, homeTeam: home ?? null, squadFilled: filled }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

/** Matches involving any of the given teams. */
export async function listMyMatches(teamIds: string[], limit = 20) {
  if (teamIds.length === 0) return []

  const myMatchTeams = await db
    .select({ matchId: matchTeams.matchId })
    .from(matchTeams)
    .where(inArray(matchTeams.teamId, teamIds))

  const matchIds = myMatchTeams.map((r) => r.matchId)
  if (matchIds.length === 0) return []

  return db
    .select({
      id: matches.id,
      state: matches.state,
      matchType: matches.matchType,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfName: turfs.name,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(inArray(matches.id, matchIds))
    .orderBy(desc(matches.createdAt))
    .limit(limit)
}

export async function getMatchSide(
  matchId: string,
  teamId: string
): Promise<"home" | "away" | null> {
  const rows = await db
    .select({ side: matchTeams.side })
    .from(matchTeams)
    .where(and(eq(matchTeams.matchId, matchId), eq(matchTeams.teamId, teamId)))
    .limit(1)
  return rows[0]?.side ?? null
}

/** Roster size — for one team side, or the whole match when teamId is omitted. */
export async function countRoster(
  matchId: string,
  teamId?: string | null
): Promise<number> {
  const rows = await db
    .select({ id: matchPlayers.userId })
    .from(matchPlayers)
    .where(
      teamId
        ? and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.teamId, teamId))
        : eq(matchPlayers.matchId, matchId)
    )
  return rows.length
}

/** Pending outbound invitations for a match — shown to its managers. */
export async function listPendingInvitationsByMatch(matchId: string) {
  return db
    .select({
      id: matchInvitations.id,
      teamId: matchInvitations.teamId,
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
      teamId: matchInvitations.teamId,
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
      teamId: matchGuests.teamId,
      name: matchGuests.name,
      phone: matchGuests.phone,
      linkedUserId: matchGuests.linkedUserId,
      squadRole: matchGuests.squadRole,
    })
    .from(matchGuests)
    .where(eq(matchGuests.matchId, matchId))
    .orderBy(asc(matchGuests.createdAt))
}
