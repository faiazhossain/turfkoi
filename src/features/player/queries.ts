import "server-only"
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm"

import { db } from "@/db"
import {
  matches,
  matchPlayers,
  matchGuests,
  bookings,
  turfs,
  playerRequests,
  playerProfiles,
  users,
} from "@/db/schema"
import { FORMATS } from "@/features/matches/formats"
import {
  mergeMatchHistory,
  type MergedHistoryRow,
} from "@/features/player/history"
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
 * SS18 freshness: "available" only counts within 24h of the last toggle —
 * the same window listAvailablePlayersNearTurf applies query-side.
 */
export function isAvailabilityFresh(profile: {
  available?: boolean | null
  availableAt?: Date | null
}): boolean {
  if (!profile.available || !profile.availableAt) return false
  return (
    Date.now() - profile.availableAt.getTime() < 24 * 60 * 60 * 1000
  )
}

/**
 * SS20 / SS32: matches that need players. A match is "needs players" when the
 * roster is open (open / confirmed / roster_building) and at least one side
 * has free seats. Every open match also wants an opponent-side claim — that
 * signal is surfaced by the claim UI, not here; joining players always go to
 * a side with free seats (home while the away side is unclaimed).
 *
 * Geo-sorted by distance from the player's coords when available.
 */
export async function listMatchesNeedingPlayers(
  playerCoords?: GeoPoint | null,
  limit = 20
) {
  const rows = await db
    .select({
      id: matches.id,
      state: matches.state,
      matchType: matches.matchType,
      squadSize: matches.squadSize,
      placeholderCount: matches.placeholderCount,
      awayPlaceholderCount: matches.awayPlaceholderCount,
      awayCaptainId: matches.awayCaptainId,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfId: turfs.id,
      turfName: turfs.name,
      turfArea: turfs.area,
      turfCity: turfs.city,
      captainName: users.name,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(users, eq(users.id, matches.captainId))
    .where(
      or(
        inArray(matches.state, ["roster_building", "confirmed"]),
        eq(matches.state, "open")
      )
    )
    .orderBy(asc(matches.kickoffAt))
    .limit(limit)

  if (rows.length === 0) return []

  const matchIds = rows.map((r) => r.id)
  const rosterRows = await db
    .select({
      matchId: matchPlayers.matchId,
      side: matchPlayers.side,
    })
    .from(matchPlayers)
    .where(inArray(matchPlayers.matchId, matchIds))

  // Count-first fill math per side: identities (players + guests) + declared
  // placeholders — a side full of claimed seats stops advertising seats.
  // Pending invitations don't fill: seats go first-accept-wins.
  const guestRows = await db
    .select({
      matchId: matchGuests.matchId,
      side: matchGuests.side,
    })
    .from(matchGuests)
    .where(inArray(matchGuests.matchId, matchIds))

  // Compute distance when coords are available.
  const withMeta = rows.map((r) => {
    const max =
      r.squadSize ?? FORMATS[r.matchType as keyof typeof FORMATS]?.maxSquad ??
      FORMATS.fives.maxSquad
    const filledFor = (side: "home" | "away") =>
      rosterRows.filter((p) => p.matchId === r.id && p.side === side).length +
      guestRows.filter((g) => g.matchId === r.id && g.side === side).length +
      (side === "home" ? r.placeholderCount : r.awayPlaceholderCount)

    const spots: { side: "home" | "away"; open: number }[] = []
    const homeOpen = Math.max(0, max - filledFor("home"))
    if (homeOpen > 0) spots.push({ side: "home", open: homeOpen })
    // Away seats are only joinable once the opponent side is claimed.
    if (r.awayCaptainId !== null) {
      const awayOpen = Math.max(0, max - filledFor("away"))
      if (awayOpen > 0) spots.push({ side: "away", open: awayOpen })
    }

    return { ...r, openSpots: spots }
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
  opts: { radiusKm?: number; limit?: number; q?: string; position?: string } = {}
) {
  const { radiusKm = 10, limit = 20, q, position } = opts
  // "Available tonight" freshness window (SS18): stale toggles drop out.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const distanceExpr = sql<number>`ST_Distance(${playerProfiles.coords}, ${turfs.coords}) / 1000.0`

  const rows = await db
    .select({
      userId: playerProfiles.userId,
      name: users.name,
      position: playerProfiles.position,
      secondaryPosition: playerProfiles.secondaryPosition,
      skill: playerProfiles.skill,
      bio: playerProfiles.bio,
      avatarType: playerProfiles.avatarType,
      avatarPublicId: playerProfiles.avatarPublicId,
      avatarPresetId: playerProfiles.avatarPresetId,
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
        sql`ST_DWithin(${playerProfiles.coords}, ${turfs.coords}, ${radiusKm * 1000})`,
        // Optional filters: name substring, position (primary or secondary).
        ...(q ? [ilike(users.name, `%${q}%`)] : []),
        ...(position
          ? [
              or(
                eq(playerProfiles.position, position),
                eq(playerProfiles.secondaryPosition, position)
              ),
            ]
          : [])
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

/**
 * Matches the player participated in — their own match_players rows plus
 * match_guests rows recorded for them before they had an account (linked at
 * signup by user id, or by the same normalized phone). The rostered row wins
 * for a match where both exist. `phone` is the user's normalized users.phone.
 */
export async function listPlayerMatchHistory(
  userId: string,
  phone: string | null,
  limit = 20
): Promise<MergedHistoryRow[]> {
  const base = {
    matchId: matches.id,
    state: matches.state,
    matchType: matches.matchType,
    homeScore: matches.homeScore,
    awayScore: matches.awayScore,
    date: bookings.date,
    slotStart: bookings.slotStart,
    turfName: turfs.name,
    kickoffAt: matches.kickoffAt,
  }
  // Per-source limit: with enough rostered matches a guest-only match could
  // fall outside the merged window — acceptable at the limits used (5/20).
  const [playerRows, guestRows] = await Promise.all([
    db
      .select({ ...base, playedConfirmedAt: matchPlayers.playedConfirmedAt })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .innerJoin(bookings, eq(bookings.id, matches.bookingId))
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(eq(matchPlayers.userId, userId))
      .orderBy(desc(matches.kickoffAt))
      .limit(limit),
    db
      .select(base)
      .from(matchGuests)
      .innerJoin(matches, eq(matches.id, matchGuests.matchId))
      .innerJoin(bookings, eq(bookings.id, matches.bookingId))
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(
        phone
          ? or(
              eq(matchGuests.linkedUserId, userId),
              and(
                isNull(matchGuests.linkedUserId),
                eq(matchGuests.phone, phone)
              )
            )
          : eq(matchGuests.linkedUserId, userId)
      )
      .orderBy(desc(matches.kickoffAt))
      .limit(limit),
  ])
  return mergeMatchHistory(playerRows, guestRows, limit)
}

/** Pending player requests for one match — shown to both side captains. */
export async function listPendingPlayerRequestsByMatch(matchId: string) {
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
        eq(playerRequests.matchId, matchId),
        eq(playerRequests.status, "pending")
      )
    )
    .orderBy(asc(playerRequests.createdAt))
}
