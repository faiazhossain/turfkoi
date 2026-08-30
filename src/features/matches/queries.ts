import "server-only"
import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import {
  matches,
  matchTeams,
  matchPlayers,
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
    })
    .from(matchPlayers)
    .innerJoin(users, eq(users.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, id))

  return { ...row, sides, roster }
}

/** Open matches for discovery — optionally excludes the user's own teams. */
export async function listOpenMatches(excludeTeamIds: string[] = [], limit = 30) {
  const rows = await db
    .select({
      id: matches.id,
      matchType: matches.matchType,
      kickoffAt: matches.kickoffAt,
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
    })
    .from(matchTeams)
    .innerJoin(teams, eq(teams.id, matchTeams.teamId))
    .where(inArray(matchTeams.matchId, matchIds))

  return rows
    .map((r) => {
      const home = teamRows.find(
        (t) => t.matchId === r.id && t.side === "home"
      )
      // Exclude matches where the user's team is the home side.
      if (home && excludeTeamIds.includes(home.teamId)) return null
      return { ...r, homeTeam: home ?? null }
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
