"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import type { z } from "zod"

import { db } from "@/db"
import {
  matches,
  matchTeams,
  matchPlayers,
  matchInvitations,
  matchGuests,
  bookings,
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
} from "./schemas"
import {
  FORMATS,
  isMatchFormat,
  isValidSquadSize,
  resolveSquadRole,
  spotsLeft,
  startersOf,
} from "./formats"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}
function forbidden(): ActionResult {
  return { ok: false, error: "errors.noPermission" }
}

/** Display name for notification payloads (name falls back to phone). */
async function userDisplayName(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row?.name ?? row?.phone ?? ""
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
 *
 * Count-first (owner spec): the captain only declares HOW MANY players they
 * already have (placeholderCount, excluding themselves) — no identities are
 * collected at creation. Identities (registered invites, guests) are added
 * progressively from the match room and draw from the same squadSize pool.
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

  const { bookingId, teamId, matchType, squadSize, placeholderCount } =
    parsed.data

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

  // The creator (always on the roster) + declared placeholders must fit.
  const placeholders = Math.max(0, placeholderCount ?? 0)
  if (1 + placeholders > squadSize) {
    return { ok: false, error: "matches.errors.placeholderTooMany" }
  }

  // Compute kickoff timestamp.
  const kickoff = kickoffEpoch(booking.date, booking.slotStart.slice(0, 5))

  // Atomic insert (neon-http has no db.transaction — db.batch runs all
  // statements in one server-side transaction). The id is generated here
  // because batch takes pre-built builders (no read-back between statements).
  const matchId = crypto.randomUUID()
  const matchValues = {
    id: matchId,
    bookingId,
    captainId: user.id,
    state: "open" as const,
    matchType,
    squadSize,
    placeholderCount: placeholders,
    kickoffAt: new Date(kickoff),
  }
  const creatorInsert = db.insert(matchPlayers).values({
    matchId,
    userId: user.id,
    teamId: teamId ?? null,
    role: "member",
    squadRole: "starting",
  })

  if (teamId) {
    // Register the creating team as home side; the declared count lives on
    // the match_teams row (team sides carry their own placeholders).
    await db.batch([
      db.insert(matches).values(matchValues),
      db
        .insert(matchTeams)
        .values({ matchId, teamId, side: "home" as const, placeholderCount: 0 }),
      creatorInsert,
    ])
  } else {
    // Solo side placeholders live on the match itself.
    await db.batch([
      db.insert(matches).values(matchValues),
      creatorInsert,
    ])
  }

  revalidatePath("/matches")
  revalidatePath(`/bookings/${bookingId}`)
  return { ok: true, id: matchId, matchId }
}

/** Squad-size change: match captain only, while the roster is open. */
export async function updateSquadSizeAction(
  matchId: string,
  squadSize: number
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.captainId !== user.id) return forbidden()
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  if (!isValidSquadSize(match.matchType, squadSize)) {
    return { ok: false, error: "matches.errors.squadSizeInvalid" }
  }

  // Can't shrink below the fullest side's claim: identities + pending
  // invites + declared placeholders all consume seats.
  const { getSquadCounts } = await import("./queries")
  const counts = await getSquadCounts(matchId)
  const fullest = Math.max(0, ...counts.map((c) => c.filled))
  if (squadSize < fullest) {
    return { ok: false, error: "matches.errors.squadSizeInvalid" }
  }

  await db
    .update(matches)
    .set({ squadSize, updatedAt: new Date() })
    .where(eq(matches.id, matchId))

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Count-first squad management: adjust the side's declared placeholder count
 * ("আমার ৭ জন player আছে"). Solo side (teamId null) is the match captain's;
 * team sides belong to their owner/captain. Bounded so a side can never
 * claim more seats than the squad has left (identities + pending included) —
 * lowering the count as real players are identified is the captain's call.
 */
export async function updatePlaceholderCountAction(
  matchId: string,
  teamId: string | null,
  placeholderCount: number
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const match = await loadMatchOrError(matchId)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }

  if (teamId) {
    // Must be a side of this match, captained/owned by the requester.
    const [side] = await db
      .select({ teamId: matchTeams.teamId })
      .from(matchTeams)
      .where(and(eq(matchTeams.matchId, matchId), eq(matchTeams.teamId, teamId)))
      .limit(1)
    if (!side) return forbidden()
    const role = await getTeamRole(teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (match.captainId !== user.id) {
    return forbidden()
  }

  if (!Number.isInteger(placeholderCount) || placeholderCount < 0) {
    return { ok: false, error: "matches.errors.placeholderInvalid" }
  }

  const { getSquadCounts } = await import("./queries")
  const { placeholdersUpperBound, FORMATS } = await import("./formats")
  const counts = await getSquadCounts(matchId)
  const sideCounts = counts.find((c) => (c.teamId ?? null) === (teamId ?? null))
  const bound = placeholdersUpperBound(
    match.squadSize ?? FORMATS.fives.maxSquad,
    sideCounts?.total ?? 0,
    sideCounts?.pending ?? 0
  )
  if (placeholderCount > bound) {
    return { ok: false, error: "matches.errors.placeholderTooMany" }
  }

  if (teamId) {
    await db
      .update(matchTeams)
      .set({ placeholderCount })
      .where(and(eq(matchTeams.matchId, matchId), eq(matchTeams.teamId, teamId)))
  } else {
    await db
      .update(matches)
      .set({ placeholderCount, updatedAt: new Date() })
      .where(eq(matches.id, matchId))
  }

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Move a squad member between Starting and Substitutes. Team-rostered players
 * are managed by their side's owner/captain; solo-rostered by the match
 * captain — same authority model as removePlayerAction.
 */
export async function setSquadRoleAction(
  matchId: string,
  playerId: string,
  squadRole: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (squadRole !== "starting" && squadRole !== "substitute") {
    return { ok: false, error: "errors.invalid" }
  }

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  if (!isMatchFormat(match.matchType)) {
    return { ok: false, error: "matches.errors.matchNotFound" }
  }

  const [player] = await db
    .select({ userId: matchPlayers.userId, teamId: matchPlayers.teamId })
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, playerId))
    )
    .limit(1)
  if (!player) return { ok: false, error: "matches.errors.playerNotOnRoster" }

  if (player.teamId) {
    const role = await getTeamRole(player.teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (match.captainId !== user.id) {
    return forbidden()
  }

  if (squadRole === "starting") {
    // Promotions need a free starting slot on the player's own side.
    const { countStarting } = await import("./queries")
    const starting = await countStarting(matchId, player.teamId)
    if (starting >= startersOf(match.matchType)) {
      return { ok: false, error: "matches.errors.startingFull" }
    }
  }

  await db
    .update(matchPlayers)
    .set({ squadRole })
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, playerId))
    )

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
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

  // Can't accept your own match — neither as the home team itself nor as
  // another team captained by the same user.
  if (match.captainId === user.id) {
    return { ok: false, error: "matches.errors.ownMatch" }
  }
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
 * Resolve the acting user's squad side for a match: the first side team they
 * captain/own, or the solo side (teamId null) if they are the match captain
 * of a match with no team sides. Null = no authority.
 */
async function resolveInviterSide(
  match: typeof matches.$inferSelect,
  userId: string
): Promise<{ teamId: string | null } | null> {
  const sides = await db
    .select()
    .from(matchTeams)
    .where(eq(matchTeams.matchId, match.id))
  for (const s of sides) {
    const role = await getTeamRole(s.teamId, userId)
    if (isCaptainRole(role)) return { teamId: s.teamId }
  }
  if (sides.length === 0 && match.captainId === userId) return { teamId: null }
  return null
}

async function loadMatchOrError(matchId: string) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  return match ?? null
}

/**
 * Invite players to the match squad. Every registered player must accept for
 * themselves — there is no direct-add. Targets may be registered users
 * (userIds, or phones that resolve to a user) or unregistered phones (the
 * invite links to their account when they sign up). Capacity counts roster +
 * guests + pending invitations via getSquadCounts/spotsLeft.
 */
export async function inviteMatchPlayersAction(
  input: { matchId: string; userIds?: string[]; phones?: string[] }
): Promise<ActionResult & { invited?: number }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const match = await loadMatchOrError(input.matchId)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  const side = await resolveInviterSide(match, user.id)
  if (!side) return forbidden()
  const sideTeamId = side.teamId

  const phones = [...new Set((input.phones ?? []).map((p) => p.trim()).filter(Boolean))]
  const requestedUserIds = [...new Set((input.userIds ?? []).filter((id) => id !== user.id))]

  // Registered phones become user invites; unknown phones stay phone invites.
  let phoneInvitees: string[] = []
  if (phones.length > 0) {
    const known = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(inArray(users.phone, phones))
    requestedUserIds.push(...known.map((k) => k.id))
    phoneInvitees = phones.filter((p) => !known.some((k) => k.phone === p))
  }
  const userIds = [...new Set(requestedUserIds)]

  // Drop anyone already on the roster or already invited (pending).
  let candidates = userIds
  if (candidates.length > 0) {
    const [rosterRows, pendingRows] = await Promise.all([
      db
        .select({ userId: matchPlayers.userId })
        .from(matchPlayers)
        .where(
          and(
            eq(matchPlayers.matchId, match.id),
            inArray(matchPlayers.userId, candidates)
          )
        ),
      db
        .select({ userId: matchInvitations.inviteeUserId })
        .from(matchInvitations)
        .where(
          and(
            eq(matchInvitations.matchId, match.id),
            eq(matchInvitations.status, "pending"),
            inArray(matchInvitations.inviteeUserId, candidates)
          )
        ),
    ])
    const occupied = new Set([...rosterRows, ...pendingRows].map((r) => r.userId))
    candidates = candidates.filter((id) => !occupied.has(id))
  }
  if (phoneInvitees.length > 0) {
    const pendingPhones = await db
      .select({ phone: matchInvitations.inviteePhone })
      .from(matchInvitations)
      .where(
        and(
          eq(matchInvitations.matchId, match.id),
          eq(matchInvitations.status, "pending"),
          inArray(matchInvitations.inviteePhone, phoneInvitees)
        )
      )
    const occupied = new Set(pendingPhones.map((r) => r.phone))
    phoneInvitees = phoneInvitees.filter((p) => !occupied.has(p))
  }

  // Capacity: pending invitations consume spots until answered.
  const { getSquadCounts } = await import("./queries")
  const counts = await getSquadCounts(match.id)
  const sideCounts = counts.find((c) => (c.teamId ?? null) === sideTeamId)
  const free = spotsLeft(
    match.squadSize ?? FORMATS.fives.maxSquad,
    sideCounts?.total ?? 0,
    sideCounts?.pending ?? 0,
    sideCounts?.placeholders ?? 0
  )
  const totalRequested = candidates.length + phoneInvitees.length
  if (totalRequested === 0) {
    return { ok: false, error: "matches.errors.alreadyInvited" }
  }
  if (totalRequested > free) {
    return { ok: false, error: "matches.errors.squadFull" }
  }

  await db.insert(matchInvitations).values([
    ...candidates.map((inviteeUserId) => ({
      matchId: match.id,
      teamId: sideTeamId,
      inviteeUserId,
      invitedBy: user.id,
    })),
    ...phoneInvitees.map((inviteePhone) => ({
      matchId: match.id,
      teamId: sideTeamId,
      inviteePhone,
      invitedBy: user.id,
    })),
  ])

  if (candidates.length > 0) {
    const [turfRow] = await db
      .select({ name: turfs.name })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(eq(bookings.id, match.bookingId))
      .limit(1)
    await createNotifications(
      {
        type: "match.invite_received",
        payload: {
          matchId: match.id,
          matchType: match.matchType,
          kickoffAt: match.kickoffAt?.toISOString() ?? null,
          turfName: turfRow?.name ?? "",
          captainName: await userDisplayName(user.id),
        },
        entityType: "match",
        entityId: match.id,
      },
      candidates
    )
  }

  revalidatePath(`/matches/${match.id}`)
  return { ok: true, invited: totalRequested }
}

/**
 * Accept or decline a match invitation. Only the invitee may respond.
 * Declining is allowed anytime; accepting requires an open roster and a free
 * squad spot (the pending invite itself was holding a spot).
 */
export async function respondToMatchInvitationAction(
  invitationId: string,
  accept: boolean
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [inv] = await db
    .select()
    .from(matchInvitations)
    .where(eq(matchInvitations.id, invitationId))
    .limit(1)
  if (!inv) return { ok: false, error: "matches.errors.invitationNotFound" }
  if (inv.inviteeUserId !== user.id) return forbidden()
  if (inv.status !== "pending") {
    return { ok: false, error: "matches.errors.invitationNoLongerPending" }
  }

  if (!accept) {
    await db
      .update(matchInvitations)
      .set({ status: "declined", respondedAt: new Date() })
      .where(eq(matchInvitations.id, invitationId))
    await notifyInviter(inv.invitedBy, inv.matchId, user.id, true)
    revalidatePath(`/matches/${inv.matchId}`)
    return { ok: true }
  }

  const match = await loadMatchOrError(inv.matchId)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  if (!isMatchFormat(match.matchType)) {
    return { ok: false, error: "matches.errors.matchNotFound" }
  }

  // Capacity recheck — this invitation releases its held spot on response,
  // but other pending invites still hold theirs: first to accept wins.
  const { getSquadCounts, countStarting } = await import("./queries")
  const cap = match.squadSize ?? FORMATS.fives.maxSquad
  const counts = await getSquadCounts(inv.matchId)
  const sideCounts = counts.find((c) => (c.teamId ?? null) === (inv.teamId ?? null))
  const free = spotsLeft(
    cap,
    sideCounts?.total ?? 0,
    Math.max(0, (sideCounts?.pending ?? 0) - 1),
    sideCounts?.placeholders ?? 0
  )
  if (free < 1) {
    return { ok: false, error: "matches.errors.squadFull" }
  }

  const squadRole =
    inv.squadRoleWanted === "substitute"
      ? "substitute"
      : resolveSquadRole(await countStarting(inv.matchId, inv.teamId ?? null), match.matchType)

  await db
    .insert(matchPlayers)
    .values({
      matchId: inv.matchId,
      userId: user.id,
      teamId: inv.teamId,
      role: inv.teamId ? "member" : "guest",
      squadRole,
    })
    .onConflictDoNothing()
  await db
    .update(matchInvitations)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(matchInvitations.id, invitationId))

  await notifyInviter(inv.invitedBy, inv.matchId, user.id, false)
  revalidatePath(`/matches/${inv.matchId}`)
  return { ok: true }
}

/** Best-effort accepted/declined notification to the inviter. */
async function notifyInviter(
  invitedBy: string,
  matchId: string,
  inviteeId: string,
  declined: boolean
) {
  await createNotifications(
    {
      type: declined ? "match.invite_declined" : "match.invite_accepted",
      payload: { matchId, playerName: await userDisplayName(inviteeId) },
      entityType: "match",
      entityId: matchId,
    },
    [invitedBy]
  )
}

/** Cancel a pending invitation — the inviter or a side captain. */
export async function cancelMatchInvitationAction(
  invitationId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [inv] = await db
    .select()
    .from(matchInvitations)
    .where(eq(matchInvitations.id, invitationId))
    .limit(1)
  if (!inv) return { ok: false, error: "matches.errors.invitationNotFound" }

  if (inv.invitedBy !== user.id) {
    if (inv.teamId) {
      const role = await getTeamRole(inv.teamId, user.id)
      if (!isCaptainRole(role)) return forbidden()
    } else {
      const match = await loadMatchOrError(inv.matchId)
      if (!match || match.captainId !== user.id) return forbidden()
    }
  }
  if (inv.status !== "pending") {
    return { ok: false, error: "matches.errors.invitationNoLongerPending" }
  }

  await db
    .update(matchInvitations)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(eq(matchInvitations.id, invitationId))

  revalidatePath(`/matches/${inv.matchId}`)
  return { ok: true }
}

/**
 * Add a temporary (account-less) player to the squad directly — the one
 * exception to invite-only, since there is nobody to invite yet. If the
 * phone belongs to a registered user, refuse: invite them instead.
 */
export async function addMatchGuestAction(
  input: { matchId: string; name: string; phone?: string }
): Promise<ActionResult & { guestId?: string }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const name = input.name.trim().slice(0, 60)
  const phone = input.phone?.trim()
  if (!name) return { ok: false, error: "errors.invalid" }

  const match = await loadMatchOrError(input.matchId)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  if (!isMatchFormat(match.matchType)) {
    return { ok: false, error: "matches.errors.matchNotFound" }
  }
  const side = await resolveInviterSide(match, user.id)
  if (!side) return forbidden()

  if (phone) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1)
    if (existing) {
      return { ok: false, error: "matches.errors.guestIsRegistered" }
    }
  }

  const { getSquadCounts } = await import("./queries")
  const counts = await getSquadCounts(match.id)
  const sideCounts = counts.find((c) => (c.teamId ?? null) === side.teamId)
  const free = spotsLeft(
    match.squadSize ?? FORMATS.fives.maxSquad,
    sideCounts?.total ?? 0,
    sideCounts?.pending ?? 0,
    sideCounts?.placeholders ?? 0
  )
  if (free < 1) return { ok: false, error: "matches.errors.squadFull" }

  const squadRole = resolveSquadRole(sideCounts?.starting ?? 0, match.matchType)
  const [guest] = await db
    .insert(matchGuests)
    .values({
      matchId: match.id,
      teamId: side.teamId,
      name,
      phone: phone || null,
      squadRole,
      addedBy: user.id,
    })
    .returning({ id: matchGuests.id })

  revalidatePath(`/matches/${match.id}`)
  return { ok: true, guestId: guest?.id }
}

/** Remove a temp player — the side captain (or match captain for solo). */
export async function removeMatchGuestAction(
  matchId: string,
  guestId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const match = await loadMatchOrError(matchId)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  const [guest] = await db
    .select()
    .from(matchGuests)
    .where(and(eq(matchGuests.id, guestId), eq(matchGuests.matchId, matchId)))
    .limit(1)
  if (!guest) return { ok: false, error: "matches.errors.guestNotFound" }

  if (guest.teamId) {
    const role = await getTeamRole(guest.teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (match.captainId !== user.id) {
    return forbidden()
  }

  await db.delete(matchGuests).where(eq(matchGuests.id, guestId))
  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/** Move a temp player between Starting and Substitutes — same authority. */
export async function setGuestSquadRoleAction(
  matchId: string,
  guestId: string,
  squadRole: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (squadRole !== "starting" && squadRole !== "substitute") {
    return { ok: false, error: "errors.invalid" }
  }

  const match = await loadMatchOrError(matchId)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  if (!isMatchFormat(match.matchType)) {
    return { ok: false, error: "matches.errors.matchNotFound" }
  }
  const [guest] = await db
    .select()
    .from(matchGuests)
    .where(and(eq(matchGuests.id, guestId), eq(matchGuests.matchId, matchId)))
    .limit(1)
  if (!guest) return { ok: false, error: "matches.errors.guestNotFound" }

  if (guest.teamId) {
    const role = await getTeamRole(guest.teamId, user.id)
    if (!isCaptainRole(role)) return forbidden()
  } else if (match.captainId !== user.id) {
    return forbidden()
  }

  if (squadRole === "starting") {
    const { countStarting } = await import("./queries")
    const starting = await countStarting(matchId, guest.teamId)
    if (starting >= startersOf(match.matchType)) {
      return { ok: false, error: "matches.errors.startingFull" }
    }
  }

  await db
    .update(matchGuests)
    .set({ squadRole })
    .where(eq(matchGuests.id, guestId))
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
