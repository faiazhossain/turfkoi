import "server-only"
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  matches,
  matchTeams,
  matchPlayers,
  bookings,
  turfs,
  teams,
  playerRequests,
  playerProfiles,
  users,
} from "@/db/schema"
import { ROSTER_LIMITS } from "@/features/matches/schemas"
import type { GeoPoint } from "@/db/geo"

export async function getPlayerProfile(userId: string) {
  const rows = await db
    .select()
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

/**
 * SS20 / SS32: matches that need players. A match is "needs players" when:
 *   - state is roster_building or confirmed (roster is open)
 *   - at least one team has fewer than the format's max roster
 *
 * Geo-sorted by distance from the player's coords when available.
 */
export async function listMatchesNeedingPlayers(
  playerCoords?: GeoPoint | null,
  limit = 20
) {
  // Pull matches in roster_building / confirmed state with their turfs.
  const rows = await db
    .select({
      id: matches.id,
      state: matches.state,
      matchType: matches.matchType,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfId: turfs.id,
      turfName: turfs.name,
      turfArea: turfs.area,
      turfCity: turfs.city,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(inArray(matches.state, ["roster_building", "confirmed"]))
    .orderBy(asc(matches.kickoffAt))
    .limit(limit)

  if (rows.length === 0) return []

  // Attach teams + roster counts.
  const matchIds = rows.map((r) => r.id)
  const teamRows = await db
    .select({
      matchId: matchTeams.matchId,
      teamId: matchTeams.teamId,
      teamName: teams.name,
      side: matchTeams.side,
    })
    .from(matchTeams)
    .innerJoin(teams, eq(teams.id, matchTeams.teamId))
    .where(inArray(matchTeams.matchId, matchIds))

  const rosterRows = await db
    .select({
      matchId: matchPlayers.matchId,
      teamId: matchPlayers.teamId,
    })
    .from(matchPlayers)
    .where(inArray(matchPlayers.matchId, matchIds))

  // Compute distance when coords are available.
  const withMeta = rows.map((r) => {
    const sides = teamRows.filter((t) => t.matchId === r.id)
    const max = ROSTER_LIMITS[r.matchType]?.max ?? 8
    const spots = sides
      .map((s) => {
        const filled = rosterRows.filter(
          (p) => p.matchId === r.id && p.teamId === s.teamId
        ).length
        return { teamId: s.teamId, teamName: s.teamName, side: s.side, open: Math.max(0, max - filled) }
      })
      .filter((s) => s.open > 0)

    return {
      ...r,
      teams: sides,
      openSpots: spots,
    }
  })

  // Filter to matches that actually have open spots.
  const withOpenSpots = withMeta.filter((m) => m.openSpots.length > 0)

  // Geo-sort if coords available — otherwise keep chronological order.
  if (playerCoords) {
    const distRows = await db
      .select({
        id: turfs.id,
        distance: sql<number>`ST_Distance(${turfs.coords}, ST_MakePoint(${playerCoords.lng}, ${playerCoords.lat})::geography) / 1000.0`,
      })
      .from(turfs)
      .where(inArray(turfs.id, Array.from(new Set(withOpenSpots.map((m) => m.turfId)))))
    const distMap = new Map(distRows.map((d) => [d.id, Number(d.distance)]))
    withOpenSpots.sort((a, b) => (distMap.get(a.turfId) ?? 999) - (distMap.get(b.turfId) ?? 999))
    return withOpenSpots.map((m) => ({
      ...m,
      distanceKm: distMap.get(m.turfId) ?? null,
    }))
  }

  return withOpenSpots.map((m) => ({ ...m, distanceKm: null }))
}

/**
 * SS20 / SS32: solo players marked "available" whose location is within
 * `radiusKm` of the given turf — the team->player discovery direction that
 * pairs with listMatchesNeedingPlayers (player->match).
 *
 * Privacy: player coords are rounded to ~110m at write time (F7), so pins
 * only ever show an approximate spot.
 */
export async function listAvailablePlayersNearTurf(
  turfId: string,
  radiusKm = 10,
  limit = 20
) {
  // "Available tonight" freshness window (SS18): stale toggles drop out.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const distanceExpr = sql<number>`ST_Distance(${playerProfiles.coords}, ${turfs.coords}) / 1000.0`

  const rows = await db
    .select({
      userId: playerProfiles.userId,
      name: users.name,
      position: playerProfiles.position,
      skill: playerProfiles.skill,
      area: playerProfiles.area,
      distanceKm: distanceExpr,
      lat: sql<number>`ST_Y(${playerProfiles.coords}::geometry)`,
      lng: sql<number>`ST_X(${playerProfiles.coords}::geometry)`,
    })
    .from(playerProfiles)
    .innerJoin(users, eq(users.id, playerProfiles.userId))
    .innerJoin(turfs, eq(turfs.id, turfId))
    .where(
      and(
        eq(playerProfiles.available, true),
        gte(playerProfiles.availableAt, cutoff),
        sql`ST_DWithin(${playerProfiles.coords}, ${turfs.coords}, ${radiusKm * 1000})`
      )
    )
    .orderBy(asc(distanceExpr))
    .limit(limit)

  return rows.map((r) => ({
    ...r,
    distanceKm: Number(r.distanceKm),
    lat: Number(r.lat),
    lng: Number(r.lng),
  }))
}

/** Matches the player has participated in (match_players row exists). */
export async function listPlayerMatchHistory(userId: string, limit = 20) {
  const myMatchRows = await db
    .select({ matchId: matchPlayers.matchId })
    .from(matchPlayers)
    .where(eq(matchPlayers.userId, userId))

  const matchIds = myMatchRows.map((r) => r.matchId)
  if (matchIds.length === 0) return []

  return db
    .select({
      id: matches.id,
      state: matches.state,
      matchType: matches.matchType,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfName: turfs.name,
      playedConfirmedAt: matchPlayers.playedConfirmedAt,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
    .where(and(inArray(matches.id, matchIds), eq(matchPlayers.userId, userId)))
    .orderBy(desc(matches.kickoffAt))
    .limit(limit)
}

/** Pending player requests for the matches a captain manages. */
export async function listPendingPlayerRequests(teamIds: string[]) {
  if (teamIds.length === 0) return []
  // Matches involving the captain's teams.
  const matchTeamRows = await db
    .select({ matchId: matchTeams.matchId })
    .from(matchTeams)
    .where(inArray(matchTeams.teamId, teamIds))
  const matchIds = matchTeamRows.map((r) => r.matchId)
  if (matchIds.length === 0) return []

  return db
    .select({
      matchId: playerRequests.matchId,
      userId: playerRequests.userId,
      status: playerRequests.status,
      createdAt: playerRequests.createdAt,
      playerName: users.name,
      playerPhone: users.phone,
    })
    .from(playerRequests)
    .innerJoin(users, eq(users.id, playerRequests.userId))
    .where(
      and(
        inArray(playerRequests.matchId, matchIds),
        eq(playerRequests.status, "pending")
      )
    )
    .orderBy(asc(playerRequests.createdAt))
}
