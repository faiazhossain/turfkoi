"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import type { z } from "zod"

import { db } from "@/db"
import {
  matches,
  matchTeams,
  matchPlayers,
  bookings,
  teamMembers,
  opponentRequests,
  turfs,
  users,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { getTeamRole } from "@/features/teams/queries"
import { createNotifications } from "@/features/notifications/create"
import { isCaptainRole, rosterOpen } from "./authority"
import {
  createMatchSchema,
  submitResultSchema,
  ROSTER_LIMITS,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}
function forbidden(): ActionResult {
  return { ok: false, error: "errors.noPermission" }
}

/**
 * C2 (audit): booking state = source of truth for payment/slot ownership;
 * match state = source of truth for the game flow. A match is only created
 * from a CONFIRMED booking (C1: payment happens before the match is published).
 *
 * With a team: the booker must be the owner/captain of the team they're
 * registering as home. Without a team (solo): only the booker may open a
 * match on their own booking — they become the match captain and recruit
 * players afterwards. Either way the creator lands on the roster and is
 * recorded as the match's captain.
 */
export async function createMatchAction(
  input: z.infer<typeof createMatchSchema>
): Promise<ActionResult & { matchId?: string }> {
  const parsed = createMatchSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { bookingId, teamId } = parsed.data

  // Booking must be confirmed (C1: pay before match).
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  if (!booking) return { ok: false, error: "matches.errors.bookingNotFound" }
  if (booking.status !== "confirmed") {
    return { ok: false, error: "matches.errors.bookingConfirmedFirst" }
  }

  if (teamId) {
    // Must be captain/owner of the team.
    const role = await getTeamRole(teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (booking.bookerId !== user.id) {
    // Solo creation: only the booker may open a match on their booking.
    return { ok: false, error: "matches.errors.notBookingOwner" }
  }

  // Booking must not already have a match (1:1).
  const existing = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.bookingId, bookingId))
    .limit(1)
  if (existing.length > 0) {
    return { ok: false, error: "matches.errors.matchExists" }
  }

  // Compute kickoff timestamp.
  const kickoff = kickoffEpoch(booking.date, booking.slotStart.slice(0, 5))

  // Atomic insert (neon-http has no db.transaction — db.batch runs all
  // statements in one server-side transaction). The id is generated here
  // because batch takes pre-built builders (no read-back between statements).
  const matchId = crypto.randomUUID()
  const matchInsert = db.insert(matches).values({
    id: matchId,
    bookingId,
    captainId: user.id,
    state: "open",
    matchType: "fives", // derived from turf format in a richer impl
    kickoffAt: new Date(kickoff),
  })
  const creatorRow = db.insert(matchPlayers).values({
    matchId,
    userId: user.id,
    teamId: teamId ?? null,
    role: "member",
  })

  if (teamId) {
    // Register the creating team as home side.
    await db.batch([
      matchInsert,
      db.insert(matchTeams).values({ matchId, teamId, side: "home" }),
      creatorRow,
    ])
  } else {
    await db.batch([matchInsert, creatorRow])
  }

  revalidatePath("/matches")
  revalidatePath(`/bookings/${bookingId}`)
  return { ok: true, id: matchId, matchId }
}

/**
 * Accept as opponent. First-come-first-served: the first team to accept
 * becomes the away side. Creates an opponent_request (status=accepted) and
 * transitions the match to CONFIRMED (booking is already paid — C1).
 */
export async function acceptAsOpponentAction(
  matchId: string,
  teamId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const role = await getTeamRole(teamId, user.id)
  if (role !== "owner" && role !== "captain") return forbidden()

  // Match must be open.
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.state !== "open") {
    return { ok: false, error: "matches.errors.matchNotOpen" }
  }

  // Can't accept your own match.
  const homeSide = await db
    .select()
    .from(matchTeams)
    .where(and(eq(matchTeams.matchId, matchId), eq(matchTeams.side, "home")))
    .limit(1)
  if (homeSide[0]?.teamId === teamId) {
    return { ok: false, error: "matches.errors.ownMatch" }
  }

  // Conditional update: only transition if still 'open'. Prevents races
  // where two teams accept simultaneously.
  const updated = await db
    .update(matches)
    .set({ state: "confirmed", updatedAt: new Date() })
    .where(and(eq(matches.id, matchId), eq(matches.state, "open")))
    .returning({ id: matches.id })

  if (updated.length === 0) {
    return { ok: false, error: "matches.errors.matchJustTaken" }
  }

  // Add the away team.
  await db.insert(matchTeams).values({
    matchId,
    teamId,
    side: "away",
  })

  // Record the acceptance.
  await db.insert(opponentRequests).values({
    matchId,
    teamId,
    status: "accepted",
  })

  revalidatePath("/matches")
  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Add a player to the match roster. Team adds require owner/captain of a team
 * already in the match (player must be a team member). Solo adds (teamId
 * null) are reserved for the match captain — any active player, no team
 * membership needed. Roster edits are allowed while the match is OPEN,
 * CONFIRMED or ROSTER_BUILDING; the match stays OPEN when a solo captain
 * starts recruiting so opponent discovery and join requests stay alive.
 */
export async function addPlayerAction(
  input: { matchId: string; playerId: string; teamId?: string | null }
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { matchId, playerId } = input
  const teamId = input.teamId ?? null

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }

  if (teamId) {
    // The team must actually be in this match, and the caller its captain.
    const [side] = await db
      .select({ teamId: matchTeams.teamId })
      .from(matchTeams)
      .where(and(eq(matchTeams.matchId, matchId), eq(matchTeams.teamId, teamId)))
      .limit(1)
    if (!side) return { ok: false, error: "matches.errors.teamNotInMatch" }
    const role = await getTeamRole(teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (match.captainId !== user.id) {
    // Solo adds are the match captain's prerogative.
    return forbidden()
  }

  // Team adds require the player to be a member of the team.
  if (teamId) {
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, playerId)))
      .limit(1)
    if (!membership) return { ok: false, error: "matches.errors.playerNotOnTeam" }
  }

  // Roster limit check — per-team for team adds, total roster for solo adds.
  const { countRoster } = await import("./queries")
  const count = await countRoster(matchId, teamId)
  const limits = ROSTER_LIMITS[match.matchType] ?? ROSTER_LIMITS.fives
  if (count >= limits.max) {
    return { ok: false, error: "matches.errors.rosterFull" }
  }

  // Transition to roster_building if still confirmed (team path only — an
  // OPEN solo match stays open while the captain recruits).
  if (match.state === "confirmed") {
    await db
      .update(matches)
      .set({ state: "roster_building", updatedAt: new Date() })
      .where(and(eq(matches.id, matchId), eq(matches.state, "confirmed")))
  }

  await db
    .insert(matchPlayers)
    .values({ matchId, userId: playerId, teamId, role: "member" })
    .onConflictDoNothing()

  // Tell the added player (best-effort — createNotifications swallows its
  // own failures). Skip self-adds; the captain knows they're playing.
  if (playerId !== user.id) {
    const [turfRow] = await db
      .select({ name: turfs.name })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(eq(bookings.id, match.bookingId))
      .limit(1)
    const [captain] = await db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, match.captainId))
      .limit(1)
    await createNotifications(
      {
        type: "match.player_added",
        payload: {
          matchId,
          matchType: match.matchType,
          kickoffAt: match.kickoffAt?.toISOString() ?? null,
          turfName: turfRow?.name ?? "",
          captainName: captain?.name ?? captain?.phone ?? "",
        },
        entityType: "match",
        entityId: matchId,
      },
      [playerId]
    )
  }

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Remove a player from the match roster. Team-rostered players can only be
 * removed by their team's owner/captain; solo (teamId null) players only by
 * the match captain. The captain themselves is never removable — they can
 * cancel the match instead. Roster edits are blocked once the match is no
 * longer in an open roster state.
 */
export async function removePlayerAction(
  matchId: string,
  playerId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }

  const [player] = await db
    .select({ userId: matchPlayers.userId, teamId: matchPlayers.teamId })
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, playerId))
    )
    .limit(1)
  if (!player) return { ok: false, error: "matches.errors.playerNotOnRoster" }
  if (player.userId === match.captainId) {
    return { ok: false, error: "matches.errors.cannotRemoveCaptain" }
  }

  if (player.teamId) {
    // Requester must be captain/owner of the player's team in this match.
    const role = await getTeamRole(player.teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (match.captainId !== user.id) {
    // Solo-rostered players can only be removed by the match captain.
    return forbidden()
  }

  await db
    .delete(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, playerId))
    )

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Submit match result (F1). Sets home/away score + resultStatus=pending.
 * Transitions match to COMPLETED. The other captain confirms separately.
 */
export async function submitResultAction(
  input: z.infer<typeof submitResultSchema>
): Promise<ActionResult> {
  const parsed = submitResultSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { matchId, homeScore, awayScore } = parsed.data
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!["ongoing", "completed"].includes(match.state)) {
    return { ok: false, error: "matches.errors.notReadyForResults" }
  }

  // Must be captain/owner of one of the teams.
  const sides = await db
    .select()
    .from(matchTeams)
    .where(eq(matchTeams.matchId, matchId))
  const teamIds = sides.map((s) => s.teamId)
  let requesterSide: "home" | "away" | null = null
  for (const tid of teamIds) {
    const role = await getTeamRole(tid, user.id)
    if (role === "owner" || role === "captain") {
      requesterSide = sides.find((s) => s.teamId === tid)?.side ?? null
      break
    }
  }
  if (!requesterSide) return forbidden()

  await db
    .update(matches)
    .set({
      homeScore,
      awayScore,
      resultStatus: "pending",
      submittedBy: user.id,
      submittedAt: new Date(),
      state: "completed",
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId))

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Confirm the submitted result. Only the OTHER captain can confirm.
 * Transitions resultStatus pending → confirmed.
 */
export async function confirmResultAction(matchId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.resultStatus !== "pending") {
    return { ok: false, error: "matches.errors.resultNotPending" }
  }

  // Must be captain/owner of a team in this match, but NOT the submitter.
  const sides = await db
    .select()
    .from(matchTeams)
    .where(eq(matchTeams.matchId, matchId))
  const teamIds = sides.map((s) => s.teamId)

  let isAuthorized = false
  for (const tid of teamIds) {
    const role = await getTeamRole(tid, user.id)
    if ((role === "owner" || role === "captain") && user.id !== match.submittedBy) {
      isAuthorized = true
      break
    }
  }
  if (!isAuthorized) {
    return { ok: false, error: "matches.errors.onlyOpponentConfirm" }
  }

  await db
    .update(matches)
    .set({ resultStatus: "confirmed", updatedAt: new Date() })
    .where(eq(matches.id, matchId))

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/** Helper: combine YYYY-MM-DD + HH:MM into epoch ms. */
function kickoffEpoch(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  return Date.UTC(y!, mo! - 1, d!, h!, mi!)
}
