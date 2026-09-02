import "server-only"
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/db"
import type { GeoPoint } from "@/db/geo"
import {
  matches,
  matchTeams,
  matchPlayers,
  matchInvitations,
  matchGuests,
  matchEvents,
  opponentRequests,
  bookings,
  turfs,
  teams,
  users,
} from "@/db/schema"
import { getTeamRole } from "@/features/teams/queries"
import { dedupeRecentGuests, type RecentGuestPick } from "./guests"
import { maskPhone } from "./constants"
import { isCaptainRole, type Side } from "./authority"
import type { MatchEventType } from "./events"

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
  // Team challenges (opponent_requests, accepted) surface the same way so the
  // away side renders its team name regardless of era.
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
  const challengeSides = await db
    .select({
      teamId: opponentRequests.teamId,
      side: sql<"away">`'away'`,
      teamName: teams.name,
      teamSlug: teams.slug,
    })
    .from(opponentRequests)
    .innerJoin(teams, eq(teams.id, opponentRequests.teamId))
    .where(
      and(
        eq(opponentRequests.matchId, id),
        eq(opponentRequests.status, "accepted")
      )
    )
  sides.push(...challengeSides)

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
  const [playerRows, guestRows, pendingRows, labelRows, challengeLabels, matchRow] =
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
        .select({ side: sql<"away">`'away'`, teamName: teams.name })
        .from(opponentRequests)
        .innerJoin(teams, eq(teams.id, opponentRequests.teamId))
        .where(
          and(
            eq(opponentRequests.matchId, matchId),
            eq(opponentRequests.status, "accepted")
          )
        ),
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
        labelRows.find((l) => l.side === side)?.teamName ??
        challengeLabels.find((l) => l.side === side)?.teamName ??
        null,
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
  // A team challenge that was accepted makes the whole challenging team's
  // captain-role members side captains of the away side.
  if (match.awayCaptainId !== null) {
    sides.push(
      ...(await db
        .select({ side: sql<"away">`'away'`, teamId: opponentRequests.teamId })
        .from(opponentRequests)
        .where(
          and(
            eq(opponentRequests.matchId, match.id),
            eq(opponentRequests.status, "accepted")
          )
        ))
    )
  }
  for (const s of sides) {
    const role = await getTeamRole(s.teamId, userId)
    if (isCaptainRole(role)) return s.side
  }
  return null
}

export type OpenMatchSort = "time" | "near"

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
  /** Pin position for the matches map (ST_Y/ST_X of the geography column). */
  turfLat: number
  turfLng: number
  distanceKm: number | null
  date: string
  slotStart: string
  homeFilled: number
  awayFilled: number
}

/**
 * Open matches for discovery — every open match wants an opponent side
 * claim, and its fill counts advertise how many players are still needed.
 *
 * With coords, each card carries its turf distance. Near sort orders by that
 * distance in SQL so the limit cuts the nearest 30, not the soonest 30
 * re-sorted client-side; distance is still selected in time sort so chips
 * survive a flip back to soonest while the location stays in the URL.
 */
export async function listOpenMatches(
  limit = 30,
  opts: { sort?: OpenMatchSort; coords?: GeoPoint | null } = {}
): Promise<OpenMatchCard[]> {
  const near = opts.sort === "near" && !!opts.coords
  const distanceExpr = opts.coords
    ? sql<number>`ST_Distance(${turfs.coords}, ST_MakePoint(${opts.coords.lng}, ${opts.coords.lat})::geography) / 1000.0`
    : sql<number>`NULL::float8`

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
      distanceKm: distanceExpr,
      turfLat: sql<number>`ST_Y(${turfs.coords}::geometry)`,
      turfLng: sql<number>`ST_X(${turfs.coords}::geometry)`,
      date: bookings.date,
      slotStart: bookings.slotStart,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(captain, eq(captain.id, matches.captainId))
    .leftJoin(awayCaptain, eq(awayCaptain.id, matches.awayCaptainId))
    .where(
      and(
        eq(matches.state, "open"),
        // Kickoff passed = no longer discoverable (the nightly sweep only
        // expires these later for fee credit). NULL-escape: a match without
        // kickoff can never expire, so it must not vanish from discovery.
        sql`(${matches.kickoffAt} > now() OR ${matches.kickoffAt} IS NULL)`
      )
    )
    .orderBy(
      ...(near
        ? [asc(distanceExpr), asc(matches.kickoffAt)]
        : [asc(matches.kickoffAt)])
    )
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
      distanceKm: r.distanceKm == null ? null : Number(r.distanceKm),
      turfLat: Number(r.turfLat),
      turfLng: Number(r.turfLng),
      date: r.date,
      slotStart: r.slotStart,
      homeFilled: filledFor("home"),
      awayFilled: filledFor("away"),
    }
  })
}

export type MatchEventView = {
  id: string
  side: "home" | "away" | null
  eventType: MatchEventType
  minute: number | null
  /** Write-time snapshot, falling back to the live joins. */
  playerName: string | null
  note: string | null
  createdAt: Date
}

/** Live event log for the match room — chronological, display-name resolved. */
export async function listMatchEvents(matchId: string): Promise<MatchEventView[]> {
  const rows = await db
    .select({
      id: matchEvents.id,
      side: matchEvents.side,
      eventType: matchEvents.eventType,
      minute: matchEvents.minute,
      snapshotName: matchEvents.playerName,
      userName: users.name,
      guestName: matchGuests.name,
      note: matchEvents.note,
      createdAt: matchEvents.createdAt,
    })
    .from(matchEvents)
    .leftJoin(users, eq(users.id, matchEvents.playerUserId))
    .leftJoin(matchGuests, eq(matchGuests.id, matchEvents.playerGuestId))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.createdAt))

  return rows.map((r) => ({
    id: r.id,
    side: r.side,
    eventType: r.eventType,
    minute: r.minute,
    playerName: r.snapshotName ?? r.userName ?? r.guestName ?? null,
    note: r.note,
    createdAt: r.createdAt,
  }))
}

export type MatchLogRow = {
  id: string
  state: string
  matchType: string
  homeScore: number | null
  awayScore: number | null
  resultStatus: string
  kickoffAt: Date | null
  date: string
  slotStart: string
  turfName: string
  turfSlug: string
  /** Team name for legacy sides, else the captain's name. */
  homeSideName: string | null
  awaySideName: string | null
}

/**
 * Matches worth logging: everything live right now, then the most recent
 * finished results — the discovery list's counterpart for matches that have
 * actually started. Public data, no permission gate.
 */
export async function listMatchLogs(limit = 30): Promise<MatchLogRow[]> {
  const awayCaptain = alias(users, "away_captain")
  const rows = await db
    .select({
      id: matches.id,
      state: matches.state,
      matchType: matches.matchType,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      resultStatus: matches.resultStatus,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfName: turfs.name,
      turfSlug: turfs.slug,
      captainName: users.name,
      awayCaptainName: awayCaptain.name,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .leftJoin(users, eq(users.id, matches.captainId))
    .leftJoin(awayCaptain, eq(awayCaptain.id, matches.awayCaptainId))
    .where(inArray(matches.state, ["ongoing", "completed"]))
    // Live matches first, then newest results.
    .orderBy(
      sql`case when ${matches.state} = 'ongoing' then 0 else 1 end`,
      desc(matches.kickoffAt)
    )
    .limit(limit)

  if (rows.length === 0) return []

  const sides = await db
    .select({
      matchId: matchTeams.matchId,
      teamName: teams.name,
      side: matchTeams.side,
    })
    .from(matchTeams)
    .innerJoin(teams, eq(teams.id, matchTeams.teamId))
    .where(
      inArray(
        matchTeams.matchId,
        rows.map((r) => r.id)
      )
    )

  return rows.map((r) => {
    const home = sides.find((s) => s.matchId === r.id && s.side === "home")
    const away = sides.find((s) => s.matchId === r.id && s.side === "away")
    return {
      id: r.id,
      state: r.state,
      matchType: r.matchType,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      resultStatus: r.resultStatus,
      kickoffAt: r.kickoffAt,
      date: r.date,
      slotStart: r.slotStart,
      turfName: r.turfName,
      turfSlug: r.turfSlug,
      // Person-based matches have no team sides — the captains' names stand in.
      homeSideName: home?.teamName ?? r.captainName ?? null,
      awaySideName: away?.teamName ?? r.awayCaptainName ?? null,
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

/**
 * Resolve a share token (/m/<token>) to its match id. Tokens are public
 * convenience handles, not secrets — the match page itself enforces what a
 * visitor may see and do.
 */
export async function getMatchIdByShareToken(
  token: string
): Promise<string | null> {
  if (!/^[0-9a-f]{8}$/.test(token)) return null
  const [row] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.shareToken, token))
    .limit(1)
  return row?.id ?? null
}

export type TeamChallenge = {
  teamId: string
  teamSlug: string
  teamName: string
  status: "pending" | "accepted" | "rejected" | "cancelled" | "expired"
  sentByName: string | null
  memberCount: number
  createdAt: Date
}

/**
 * Team challenges for a match — newest first. `memberCount` advertises the
 * squad strength the home captain is weighing before accept/reject.
 */
export async function listTeamChallenges(matchId: string): Promise<TeamChallenge[]> {
  const sender = alias(users, "challenge_sender")
  return db
    .select({
      teamId: opponentRequests.teamId,
      teamSlug: teams.slug,
      teamName: teams.name,
      status: opponentRequests.status,
      sentByName: sender.name,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM team_members tm
        WHERE tm.team_id = ${opponentRequests.teamId}
      )`,
      createdAt: opponentRequests.createdAt,
    })
    .from(opponentRequests)
    .innerJoin(teams, eq(teams.id, opponentRequests.teamId))
    .leftJoin(sender, eq(sender.id, opponentRequests.sentBy))
    .where(eq(opponentRequests.matchId, matchId))
    .orderBy(desc(opponentRequests.createdAt))
}

export type InvitationOutcome = {
  id: string
  side: Side
  /** Registered invitee name; null for phone invites. */
  playerName: string | null
  /** Phone invites render masked digits only — never the raw number. */
  inviteePhoneMasked: string | null
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired"
  respondedAt: Date | null
  createdAt: Date
}

/**
 * Every invitation ever sent for a match with its outcome — the join battle
 * log: accepted rows render Confirmed, declined Declined, and pending rows
 * on a full side carry the "you were late" copy.
 */
export async function listInvitationOutcomes(
  matchId: string,
  limit = 20
): Promise<InvitationOutcome[]> {
  const rows = await db
    .select({
      id: matchInvitations.id,
      side: matchInvitations.side,
      inviteeUserId: matchInvitations.inviteeUserId,
      inviteePhone: matchInvitations.inviteePhone,
      playerName: users.name,
      status: matchInvitations.status,
      respondedAt: matchInvitations.respondedAt,
      createdAt: matchInvitations.createdAt,
    })
    .from(matchInvitations)
    .leftJoin(users, eq(users.id, matchInvitations.inviteeUserId))
    .where(eq(matchInvitations.matchId, matchId))
    .orderBy(asc(matchInvitations.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    side: r.side,
    playerName: r.playerName,
    inviteePhoneMasked: r.inviteePhone ? maskPhone(r.inviteePhone) : null,
    status: r.status,
    respondedAt: r.respondedAt,
    createdAt: r.createdAt,
  }))
}
