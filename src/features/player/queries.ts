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
  ne,
  notExists,
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
  userBlocks,
} from "@/db/schema"
import { FORMATS, spotsLeft } from "@/features/matches/formats"
import { ROSTER_OPEN_STATES, rosterOpen } from "@/features/matches/authority"
import {
  mergeMatchHistory,
  type MergedHistoryRow,
} from "@/features/player/history"
import { isPlayerIdFormat, normalizeUsername } from "@/features/player/username"
import type { GeoPoint } from "@/db/geo"

export async function getPlayerProfile(userId: string) {
  const rows = await db
    .select()
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

/** SQL that excludes users block-linked to `viewerId` in EITHER direction. */
function notBlockedWith(viewerId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, users.id)),
          and(eq(userBlocks.blockerId, users.id), eq(userBlocks.blockedId, viewerId))
        )
      )
  )
}

export interface PlayerCardRow {
  userId: string
  name: string | null
  playerId: string | null
  username: string | null
  position: string | null
  secondaryPosition: string | null
  skill: string | null
  area: string | null
  lastSeenAt: Date | null
  avatarType: string | null
  avatarPresetId: string | null
  avatarPublicId: string | null
}

const playerCardColumns = {
  userId: users.id,
  name: users.name,
  playerId: playerProfiles.playerId,
  username: playerProfiles.username,
  position: playerProfiles.position,
  secondaryPosition: playerProfiles.secondaryPosition,
  skill: playerProfiles.skill,
  area: playerProfiles.area,
  lastSeenAt: playerProfiles.lastSeenAt,
  avatarType: playerProfiles.avatarType,
  avatarPresetId: playerProfiles.avatarPresetId,
  avatarPublicId: playerProfiles.avatarPublicId,
}

/** Public profile lookup by Player ID (DT-XXXXXX). Null when unknown. */
export async function getPlayerByCode(code: string): Promise<PlayerCardRow | null> {
  const normalized = code.trim().toUpperCase()
  if (!isPlayerIdFormat(normalized)) return null
  const rows = await db
    .select(playerCardColumns)
    .from(users)
    .innerJoin(playerProfiles, eq(playerProfiles.userId, users.id))
    .where(and(eq(playerProfiles.playerId, normalized), ne(users.status, "deleted")))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Player search (Player Network): a query is resolved in priority order —
 * exact Player ID (DT-…), then exact/prefix @username, then name substring.
 * Blocked pairs and deleted accounts never appear.
 */
export async function searchPlayersByIdentity(
  viewerId: string,
  rawQuery: string,
  limit = 10
): Promise<PlayerCardRow[]> {
  const q = rawQuery.trim()
  if (q.length < 2) return []
  const baseWhere = [
    ne(users.id, viewerId),
    ne(users.status, "deleted"),
    notBlockedWith(viewerId),
  ]

  const upper = q.toUpperCase()
  if (isPlayerIdFormat(upper)) {
    const rows = await db
      .select(playerCardColumns)
      .from(users)
      .innerJoin(playerProfiles, eq(playerProfiles.userId, users.id))
      .where(and(...baseWhere, eq(playerProfiles.playerId, upper)))
      .limit(limit)
    if (rows.length > 0) return rows
  }

  const username = normalizeUsername(q)
  if (USERNAME_PREFIX_RE.test(username)) {
    const rows = await db
      .select(playerCardColumns)
      .from(users)
      .innerJoin(playerProfiles, eq(playerProfiles.userId, users.id))
      .where(
        and(
          ...baseWhere,
          or(
            eq(playerProfiles.username, username),
            ilike(playerProfiles.username, `${username}%`)
          )
        )
      )
      .orderBy(asc(playerProfiles.username))
      .limit(limit)
    if (rows.length > 0) return rows
  }

  return db
    .select(playerCardColumns)
    .from(users)
    .innerJoin(playerProfiles, eq(playerProfiles.userId, users.id))
    .where(and(...baseWhere, ilike(users.name, `%${q}%`)))
    .orderBy(asc(users.name))
    .limit(limit)
}

const USERNAME_PREFIX_RE = /^[a-z0-9_]{2,}$/

/**
 * Matches the viewer can invite this player to (Player Network profile →
 * "Invite to Match"): viewer is the home or away side captain, the roster is
 * still open, and the viewer's own side has at least one open seat.
 */
export async function listInvitableMatchesFor(viewerId: string, limit = 10) {
  const rows = await db
    .select({
      id: matches.id,
      state: matches.state,
      captainId: matches.captainId,
      matchType: matches.matchType,
      squadSize: matches.squadSize,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfName: turfs.name,
      turfArea: turfs.area,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(
      and(
        or(eq(matches.captainId, viewerId), eq(matches.awayCaptainId, viewerId)),
        inArray(matches.state, ROSTER_OPEN_STATES)
      )
    )
    .orderBy(asc(matches.kickoffAt))
    .limit(limit)

  const { getSquadCounts } = await import("@/features/matches/queries")
  const invitable = []
  for (const match of rows) {
    if (!rosterOpen(match.state)) continue
    const counts = await getSquadCounts(match.id)
    // The creator sits home; the away-side claimant sits away.
    const side = match.captainId === viewerId ? "home" : "away"
    const sideCounts = counts.find((c) => c.side === side)
    const cap =
      match.squadSize ?? FORMATS[match.matchType as keyof typeof FORMATS]?.maxSquad ??
      FORMATS.fives.maxSquad
    if (spotsLeft(cap, sideCounts?.total ?? 0, sideCounts?.placeholders ?? 0) > 0) {
      invitable.push(match)
    }
  }
  return invitable
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
 * roster is open (open / confirmed / roster_building), at least one side
 * has free seats, and kickoff hasn't passed — a match that already started
 * is never joinable, whatever its state says. Every open match also wants an
 * opponent-side claim — that signal is surfaced by the claim UI, not here;
 * joining players always go to a side with free seats (home while the away
 * side is unclaimed).
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
      captainId: users.id,
      captainName: users.name,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(users, eq(users.id, matches.captainId))
    .where(
      and(
        or(
          inArray(matches.state, ["roster_building", "confirmed"]),
          eq(matches.state, "open")
        ),
        sql`${matches.kickoffAt} > now()`
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

/**
 * Completed matches the player took part in — the XP basis for the dashboard
 * level bar. Same two-source merge as listPlayerMatchHistory (rostered rows
 * plus pre-account guest rows linked by user id or phone), deduped by match
 * id so a match counts once. Completed-only: unfinished matches grant no XP.
 */
export async function countPlayerMatches(
  userId: string,
  phone: string | null
): Promise<number> {
  const completed = eq(matches.state, "completed")
  const [playerRows, guestRows] = await Promise.all([
    db
      .select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(eq(matchPlayers.userId, userId), completed)),
    db
      .select({ matchId: matchGuests.matchId })
      .from(matchGuests)
      .innerJoin(matches, eq(matches.id, matchGuests.matchId))
      .where(
        and(
          phone
            ? or(
                eq(matchGuests.linkedUserId, userId),
                and(
                  isNull(matchGuests.linkedUserId),
                  eq(matchGuests.phone, phone)
                )
              )
            : eq(matchGuests.linkedUserId, userId),
          completed
        )
      ),
  ])
  return new Set(playerRows.concat(guestRows).map((r) => r.matchId)).size
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
