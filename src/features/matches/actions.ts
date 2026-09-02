"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm"
import type { z } from "zod"

import { db } from "@/db"
import {
  matches,
  matchPlayers,
  matchInvitations,
  matchGuests,
  matchEvents,
  opponentRequests,
  bookings,
  turfs,
  teams,
  users,
  userBlocks,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { slotStartEpoch } from "@/lib/slot-expansion"
import { scheduleMatchFeeExpiry } from "@/lib/inngest"
import { MATCH_FEE_BDT } from "@/lib/pricing"
import {
  creditMatchFees,
  applyWalletMovement,
  creditFeeEntry,
  latestAwayFeeEntry,
} from "@/features/wallet/service"
import {
  homeFeeKey,
  awayFeeKey,
  shouldCreditMatchFees,
} from "@/features/wallet/logic"
import { getWalletBalance } from "@/features/wallet/queries"
import { isValidPhone, normalizePhone } from "@/features/auth/phone"
import { createNotifications } from "@/features/notifications/create"
import { getTeamRole, listTeamMembers } from "@/features/teams/queries"
import {
  canAssignRecorder,
  canLogMatchEvents,
  isCaptainRole,
  rosterOpen,
} from "./authority"
import {
  addGuestSchema,
  assignRecorderSchema,
  claimOpponentSideSchema,
  createMatchSchema,
  deleteMatchEventSchema,
  logMatchEventSchema,
  submitResultSchema,
} from "./schemas"
import { matchMinute, parsePlayerRef } from "./events"
import {
  FORMATS,
  isMatchFormat,
  isValidSquadSize,
  maxPendingInvitations,
  resolveSquadRole,
  spotsLeft,
  startersOf,
} from "./formats"
import {
  countStarting,
  getSquadCounts,
  resolveSideCaptain,
} from "./queries"
import { maskPhone, mintShareToken } from "./constants"
import { lockMatchForSeatClaim, seatsFreeSql } from "./seat-claim"

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
 * from a CONFIRMED booking (C1: payment happens before the match is published)
 * and only by its booker — they become the home captain, declare how many
 * players they already have, and recruit the rest afterwards. Everyone can
 * book, so everyone can create a match.
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

  const { bookingId, matchType, squadSize, placeholderCount } = parsed.data

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
  if (booking.bookerId !== user.id) {
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
  const kickoff = slotStartEpoch(booking.date, booking.slotStart.slice(0, 5))

  // Matchmaking fee (wallet-first): ৳25 from the creator's wallet, then the
  // match insert — ONE multi-CTE statement (neon-http has no interactive
  // transactions; a single statement is atomic). The balance UPDATE is the
  // sole authority; the match insert only runs from its RETURNING rows, so
  // an unfunded captain can never create a fee-less match. The pre-check
  // only picks the friendly error message.
  const balance = await getWalletBalance(user.id)
  if (balance < MATCH_FEE_BDT) {
    return { ok: false, error: "wallet.errors.insufficientBalance" }
  }

  const matchId = crypto.randomUUID()
  const feeKey = homeFeeKey(matchId)
  await db.execute(sql`
    WITH upd AS (
      UPDATE wallet_balances
      SET balance = balance - ${MATCH_FEE_BDT}::numeric, updated_at = now()
      WHERE user_id = ${user.id}
        AND balance >= ${MATCH_FEE_BDT}::numeric
        AND NOT EXISTS (
          SELECT 1 FROM wallet_entries WHERE idempotency_key = ${feeKey}
        )
      RETURNING balance
    ), fee AS (
      INSERT INTO wallet_entries (
        user_id, type, status, amount, match_id, balance_after,
        idempotency_key, description
      )
      SELECT ${user.id}, 'match_fee', 'success', ${-MATCH_FEE_BDT}::numeric,
             ${matchId}, (SELECT balance FROM upd), ${feeKey}, 'match fee (home)'
      FROM upd
      RETURNING id
    ), m AS (
      INSERT INTO matches (
        id, booking_id, captain_id, state, match_type, squad_size,
        placeholder_count, kickoff_at, share_token
      )
      SELECT ${matchId}::uuid, ${bookingId}::uuid, ${user.id}::uuid, 'open',
             ${matchType}::match_type, ${squadSize}, ${placeholders},
             ${new Date(kickoff).toISOString()}::timestamptz,
             ${mintShareToken()}
      WHERE EXISTS (SELECT 1 FROM fee)
      RETURNING id
    ), mp AS (
      INSERT INTO match_players (match_id, user_id, side, role, squad_role)
      SELECT ${matchId}::uuid, ${user.id}::uuid, 'home', 'member', 'starting'
      WHERE EXISTS (SELECT 1 FROM m)
    )
    SELECT (SELECT count(*) FROM m)::int AS created
  `)

  // Balance moved concurrently between pre-check and statement → no match.
  const [created] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!created) {
    return { ok: false, error: "wallet.errors.insufficientBalance" }
  }

  // Fall-through safety net: an unclaimed open match expires after kickoff +
  // grace and the home fee is credited back. Best-effort — the nightly sweep
  // reconciles missed events.
  scheduleMatchFeeExpiry(matchId, kickoff).catch(() => {})

  revalidatePath("/matches")
  revalidatePath(`/bookings/${bookingId}`)
  return { ok: true, id: matchId, matchId }
}

/**
 * Squad-size change: home captain only, while the roster is open. The away
 * captain recruits inside the same squadSize — resizing is the match owner's
 * call.
 */
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

  // Can't shrink below either side's claim: identities + declared
  // placeholders. Pending invites don't block shrinking — they're candidates,
  // not reservations, and simply lose at accept time if no seat remains.
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
 * Claim the open opponent side (person-based FCFS — replaces the team
 * challenge). Any signed-in player who isn't already part of the match
 * declares how many players they bring (count-first, themselves included)
 * and becomes the away captain. The conditional UPDATE makes the whole claim
 * atomic: a single row transition, so a confirmed match always has an away
 * captain even under concurrent claims.
 */
export async function claimOpponentSideAction(
  input: z.infer<typeof claimOpponentSideSchema>
): Promise<ActionResult> {
  const parsed = claimOpponentSideSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { matchId, playerCount } = parsed.data
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.state !== "open") {
    return { ok: false, error: "matches.errors.matchNotOpen" }
  }
  if (match.captainId === user.id) {
    return { ok: false, error: "matches.errors.ownMatch" }
  }
  const [rosterRow] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id)))
    .limit(1)
  if (rosterRow) {
    return { ok: false, error: "matches.errors.alreadyOnRoster" }
  }

  // The claimant's group (themselves + declared placeholders) must fit one
  // side of the squad.
  const cap = match.squadSize ?? FORMATS.fives.maxSquad
  if (playerCount > cap) {
    return { ok: false, error: "matches.errors.placeholderTooMany" }
  }

  // Matchmaking fee (wallet-first): claim and fee in ONE multi-CTE statement.
  // The match-row lock serializes FCFS claimants; the claim only lands if
  // the wallet (locked read → fresh value) covers the ৳25; the balance
  // UPDATE is the authority and the fee entry only lands from its RETURNING
  // rows. A race loser is never charged.
  const balance = await getWalletBalance(user.id)
  if (balance < MATCH_FEE_BDT) {
    return { ok: false, error: "wallet.errors.insufficientBalance" }
  }
  const feeKey = awayFeeKey(matchId, user.id)

  await db.execute(sql`
    WITH lockrow AS (
      SELECT balance FROM wallet_balances WHERE user_id = ${user.id} FOR UPDATE
    ), claim AS (
      UPDATE matches
      SET away_captain_id = ${user.id}::uuid,
          away_placeholder_count = ${playerCount - 1},
          state = 'confirmed',
          updated_at = now()
      WHERE id = ${matchId}::uuid
        AND state = 'open'
        AND away_captain_id IS NULL
        AND COALESCE((SELECT balance FROM lockrow), 0) >= ${MATCH_FEE_BDT}::numeric
      RETURNING id
    ), upd AS (
      UPDATE wallet_balances
      SET balance = balance - ${MATCH_FEE_BDT}::numeric, updated_at = now()
      WHERE user_id = ${user.id}
        AND balance >= ${MATCH_FEE_BDT}::numeric
        AND NOT EXISTS (
          SELECT 1 FROM wallet_entries WHERE idempotency_key = ${feeKey}
        )
        AND EXISTS (SELECT 1 FROM claim)
      RETURNING balance
    ), fee AS (
      INSERT INTO wallet_entries (
        user_id, type, status, amount, match_id, balance_after,
        idempotency_key, description
      )
      SELECT ${user.id}, 'match_fee', 'success', ${-MATCH_FEE_BDT}::numeric,
             ${matchId}, (SELECT balance FROM upd), ${feeKey}, 'match fee (away)'
      FROM upd
      RETURNING id
    ), mp AS (
      INSERT INTO match_players (match_id, user_id, side, role, squad_role)
      SELECT ${matchId}::uuid, ${user.id}::uuid, 'away', 'member', 'starting'
      WHERE EXISTS (SELECT 1 FROM claim)
    )
    SELECT (SELECT count(*) FROM claim)::int AS claimed
  `)

  // Re-read the outcome (statements can't return across neon-http batches).
  const [claimedMatch] = await db
    .select({ awayCaptainId: matches.awayCaptainId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (claimedMatch?.awayCaptainId !== user.id) {
    return { ok: false, error: "matches.errors.matchJustTaken" }
  }

  const [turfRow] = await db
    .select({ name: turfs.name })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(eq(bookings.id, match.bookingId))
    .limit(1)
  await createNotifications(
    {
      type: "match.opponent_claimed",
      payload: {
        matchId,
        playerName: await userDisplayName(user.id),
        turfName: turfRow?.name ?? "",
      },
      entityType: "match",
      entityId: matchId,
    },
    [match.captainId]
  )

  revalidatePath("/matches")
  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Count-first squad management: adjust the side's declared placeholder count
 * ("আমার ৭ জন player আছে"). Each side's captain manages their own count —
 * bounded so a side can never claim more seats than the squad has left
 * (identities + pending included). Lowering the count as real players are
 * identified is the captain's call.
 */
export async function updatePlaceholderCountAction(
  matchId: string,
  side: "home" | "away",
  placeholderCount: number
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
  if ((await resolveSideCaptain(match, user.id)) !== side) {
    return forbidden()
  }

  if (!Number.isInteger(placeholderCount) || placeholderCount < 0) {
    return { ok: false, error: "matches.errors.placeholderInvalid" }
  }

  const { placeholdersUpperBound } = await import("./formats")
  const counts = await getSquadCounts(matchId)
  const sideCounts = counts.find((c) => c.side === side)
  const bound = placeholdersUpperBound(
    match.squadSize ?? FORMATS.fives.maxSquad,
    sideCounts?.total ?? 0
  )
  if (placeholderCount > bound) {
    return { ok: false, error: "matches.errors.placeholderTooMany" }
  }

  await db
    .update(matches)
    .set(
      side === "home"
        ? { placeholderCount, updatedAt: new Date() }
        : { awayPlaceholderCount: placeholderCount, updatedAt: new Date() }
    )
    .where(eq(matches.id, matchId))

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Move a squad member between Starting and Substitutes. Managed by the
 * captain of the member's own side (legacy team members via the team-role
 * fallback inside resolveSideCaptain).
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
    .select({ userId: matchPlayers.userId, side: matchPlayers.side })
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, playerId))
    )
    .limit(1)
  if (!player) return { ok: false, error: "matches.errors.playerNotOnRoster" }

  if ((await resolveSideCaptain(match, user.id)) !== player.side) {
    return forbidden()
  }

  if (squadRole === "starting") {
    // Promotions need a free starting slot on the player's own side.
    const starting = await countStarting(matchId, player.side)
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
 * Invite players to the match squad. Every registered player must accept for
 * themselves — there is no direct-add. Targets may be registered users
 * (userIds, or phones that resolve to a user) or unregistered phones (the
 * invite links to their account when they sign up). Pending invitations are
 * prospects, not reservations: a side may hold up to maxPendingInvitations
 * (open seats + buffer) — whoever accepts first claims a seat. Invites seat
 * on the inviter's side.
 */
export async function inviteMatchPlayersAction(
  input: { matchId: string; userIds?: string[]; phones?: string[] }
): Promise<ActionResult & { invited?: number }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, input.matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  const side = await resolveSideCaptain(match, user.id)
  if (!side) return forbidden()

  // Phone invites are stored normalized so they match users.phone (invite
  // becomes a user invite) and the signup link finds them later.
  const phones = [
    ...new Set(
      (input.phones ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => normalizePhone(p))
    ),
  ]
  if (phones.some((p) => !isValidPhone(p))) {
    return { ok: false, error: "matches.errors.phoneInvalid" }
  }
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

  // Player Network: no invitations between blocked pairs (either direction).
  // Registered phone targets are already folded into userIds, so this covers
  // both direct and phone-derived invites. Strict: the captain gets a clear
  // error instead of a silent partial invite.
  if (userIds.length > 0) {
    const blockedRows = await db
      .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, user.id), inArray(userBlocks.blockedId, userIds)),
          and(eq(userBlocks.blockedId, user.id), inArray(userBlocks.blockerId, userIds))
        )
      )
    if (blockedRows.length > 0) {
      return { ok: false, error: "matches.errors.inviteeBlocked" }
    }
  }

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

  // Capacity: open seats are claimed first-accept-wins, so a side may hold
  // more pending invitations than it has open seats (over-invite buffer) —
  // ignored invites no longer lock the captain out.
  const counts = await getSquadCounts(match.id)
  const sideCounts = counts.find((c) => c.side === side)
  const openSeats = spotsLeft(
    match.squadSize ?? FORMATS.fives.maxSquad,
    sideCounts?.total ?? 0,
    sideCounts?.placeholders ?? 0
  )
  const totalRequested = candidates.length + phoneInvitees.length
  if (totalRequested === 0) {
    return { ok: false, error: "matches.errors.alreadyInvited" }
  }
  if ((sideCounts?.pending ?? 0) + totalRequested > maxPendingInvitations(openSeats)) {
    return { ok: false, error: "matches.errors.tooManyInvites" }
  }
  // More invites out than open seats — invitees get the accept-fast copy.
  const contested = (sideCounts?.pending ?? 0) + totalRequested > openSeats

  await db.insert(matchInvitations).values([
    ...candidates.map((inviteeUserId) => ({
      matchId: match.id,
      side,
      inviteeUserId,
      invitedBy: user.id,
    })),
    ...phoneInvitees.map((inviteePhone) => ({
      matchId: match.id,
      side,
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
          contested,
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
 * Declining is allowed anytime. Accepting claims a seat on the inviter's
 * side first-accept-wins: pending invites don't reserve seats, so when
 * several invitees race for the last seat the batch below hands it to
 * exactly one of them and the rest get matches.errors.seatTaken with their
 * invite still pending.
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

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, inv.matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }
  if (!isMatchFormat(match.matchType)) {
    return { ok: false, error: "matches.errors.matchNotFound" }
  }

  // A stale invite must not accept into a side the user already occupies
  // through another path (join request, opponent claim, the other side).
  const [existingSeat] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, inv.matchId), eq(matchPlayers.userId, user.id))
    )
    .limit(1)
  if (existingSeat) {
    return { ok: false, error: "matches.errors.alreadyOnRoster" }
  }

  const squadRole =
    inv.squadRoleWanted === "substitute"
      ? "substitute"
      : resolveSquadRole(await countStarting(inv.matchId, inv.side), match.matchType)

  // First-accept-wins seat claim, atomic in one server-side transaction
  // (neon-http has no db.transaction — db.batch runs all statements as one):
  // lock the match row so concurrent claims serialize, insert only while the
  // side has a free seat, and flip the invite only if that insert landed
  // (side-scoped EXISTS). A loser's insert is a no-op, their invite stays
  // pending, and they can still claim a seat that opens up later.
  await db.batch([
    lockMatchForSeatClaim(inv.matchId),
    db.execute(sql`
      INSERT INTO match_players (match_id, user_id, side, role, squad_role)
      SELECT ${inv.matchId}, ${user.id}, ${inv.side}, 'member', ${squadRole}
      WHERE ${seatsFreeSql(inv.matchId, inv.side)}
      ON CONFLICT DO NOTHING
    `),
    db.execute(sql`
      UPDATE match_invitations
      SET status = 'accepted', responded_at = now()
      WHERE id = ${invitationId} AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM match_players
          WHERE match_id = ${inv.matchId}
            AND user_id = ${user.id}
            AND side = ${inv.side}
        )
    `),
  ])

  const [seat] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(
      and(
        eq(matchPlayers.matchId, inv.matchId),
        eq(matchPlayers.userId, user.id),
        eq(matchPlayers.side, inv.side)
      )
    )
    .limit(1)
  if (!seat) {
    // The seat went to another invitee — the invitation deliberately stays
    // pending so they can still claim a seat that opens up later.
    return { ok: false, error: "matches.errors.seatTaken" }
  }

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

/** Cancel a pending invitation — the inviter or the invite's side captain. */
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
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, inv.matchId))
      .limit(1)
    if (!match || (await resolveSideCaptain(match, user.id)) !== inv.side) {
      return forbidden()
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
 * exception to invite-only, since there is nobody to invite yet. Carries the
 * squad-sheet basics (position, optional jersey number) and, when the phone
 * belongs to a registered user, refuses: invite them instead. The guest
 * joins the adder's side.
 */
export async function addMatchGuestAction(
  input: {
    matchId: string
    name: string
    phone?: string
    position?: string
    jerseyNumber?: number
  }
): Promise<ActionResult & { guestId?: string }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const parsed = addGuestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const { matchId, name, phone, position, jerseyNumber } = parsed.data

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
  const side = await resolveSideCaptain(match, user.id)
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

  // Fast capacity pre-check — the authoritative first-accept-wins claim
  // happens atomically in the batch below.
  const counts = await getSquadCounts(match.id)
  const sideCounts = counts.find((c) => c.side === side)
  const free = spotsLeft(
    match.squadSize ?? FORMATS.fives.maxSquad,
    sideCounts?.total ?? 0,
    sideCounts?.placeholders ?? 0
  )
  if (free < 1) return { ok: false, error: "matches.errors.squadFull" }

  const squadRole = resolveSquadRole(sideCounts?.starting ?? 0, match.matchType)

  // First-accept-wins claim, same batch shape as the invite accept: lock the
  // match row, insert the guest only while the side has a free seat. The id
  // is generated here because batch takes pre-built statements (no read-back
  // between them) — mirroring createMatchAction.
  const guestId = crypto.randomUUID()
  await db.batch([
    lockMatchForSeatClaim(match.id),
    db.execute(sql`
      INSERT INTO match_guests
        (id, match_id, side, name, phone, position, jersey_number, squad_role, added_by)
      SELECT
        ${guestId}, ${match.id}, ${side}, ${name}, ${phone ?? null},
        ${position ?? null}, ${jerseyNumber ?? null}, ${squadRole}, ${user.id}
      WHERE ${seatsFreeSql(match.id, side)}
    `),
  ])
  const [guest] = await db
    .select({ id: matchGuests.id })
    .from(matchGuests)
    .where(eq(matchGuests.id, guestId))
    .limit(1)
  if (!guest) {
    return { ok: false, error: "matches.errors.squadFull" }
  }

  revalidatePath(`/matches/${match.id}`)
  return { ok: true, guestId: guest.id }
}

/** Remove a temp player — the captain of the guest's own side. */
export async function removeMatchGuestAction(
  matchId: string,
  guestId: string
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
  const [guest] = await db
    .select()
    .from(matchGuests)
    .where(and(eq(matchGuests.id, guestId), eq(matchGuests.matchId, matchId)))
    .limit(1)
  if (!guest) return { ok: false, error: "matches.errors.guestNotFound" }

  if ((await resolveSideCaptain(match, user.id)) !== guest.side) {
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
  const [guest] = await db
    .select()
    .from(matchGuests)
    .where(and(eq(matchGuests.id, guestId), eq(matchGuests.matchId, matchId)))
    .limit(1)
  if (!guest) return { ok: false, error: "matches.errors.guestNotFound" }

  if ((await resolveSideCaptain(match, user.id)) !== guest.side) {
    return forbidden()
  }

  if (squadRole === "starting") {
    const starting = await countStarting(matchId, guest.side)
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
 * Remove a player from the match roster. Managed by the captain of the
 * player's own side. Neither captain is removable — they can leave only via
 * their own dedicated flows (the match captain can't leave at all). Roster
 * edits are blocked once the match is no longer in an open roster state.
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
    .select({ userId: matchPlayers.userId, side: matchPlayers.side })
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, playerId))
    )
    .limit(1)
  if (!player) return { ok: false, error: "matches.errors.playerNotOnRoster" }
  if (
    player.userId === match.captainId ||
    (match.awayCaptainId !== null && player.userId === match.awayCaptainId)
  ) {
    return { ok: false, error: "matches.errors.cannotRemoveCaptain" }
  }

  if ((await resolveSideCaptain(match, user.id)) !== player.side) {
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
 * Transitions match to COMPLETED. Either side's captain can submit (solo
 * matches included); the other captain confirms separately.
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

  if (!(await resolveSideCaptain(match, user.id))) return forbidden()

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
 * Confirm the submitted result. Only the OTHER side's captain can confirm.
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

  // A side captain — but not the submitter.
  const isSideCaptain = await resolveSideCaptain(match, user.id)
  if (!isSideCaptain || user.id === match.submittedBy) {
    return { ok: false, error: "matches.errors.onlyOpponentConfirm" }
  }

  await db
    .update(matches)
    .set({ resultStatus: "confirmed", updatedAt: new Date() })
    .where(eq(matches.id, matchId))

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Send a team challenge: one of the team's captain-role members challenges
 * an open match as a unit. Eligibility mirrors the person-based claim (match
 * open, no away captain yet, sender not on the roster) — but the challenge is
 * a REQUEST, not a claim: the match stays open and other candidates (people
 * or teams) keep competing until the home captain accepts one. A declined or
 * cancelled challenge can be re-sent; a pending one cannot be duplicated.
 */
export async function challengeMatchAction(
  matchId: string,
  teamId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.state !== "open" || match.awayCaptainId !== null) {
    return { ok: false, error: "matches.errors.matchNotOpen" }
  }
  if (match.captainId === user.id) {
    return { ok: false, error: "matches.errors.ownMatch" }
  }

  const role = await getTeamRole(teamId, user.id)
  if (!isCaptainRole(role)) return forbidden()

  const [rosterRow] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id)))
    .limit(1)
  if (rosterRow) {
    return { ok: false, error: "matches.errors.alreadyOnRoster" }
  }

  // One live row per (match, team): re-sending flips a stale declined/
  // cancelled row back to pending, a pending row is an error.
  const [existing] = await db
    .select({ status: opponentRequests.status })
    .from(opponentRequests)
    .where(
      and(
        eq(opponentRequests.matchId, matchId),
        eq(opponentRequests.teamId, teamId)
      )
    )
    .limit(1)
  if (existing?.status === "pending") {
    return { ok: false, error: "matches.errors.challengePending" }
  }

  // Matchmaking fee (wallet-first): the away captain pays ৳25 when SENDING
  // the challenge. The key is unique per attempt so a re-send after a
  // declined (and credited-back) challenge charges again; the fee is
  // credited back when their last pending challenge for this match dies.
  const balance = await getWalletBalance(user.id)
  if (balance < MATCH_FEE_BDT) {
    return { ok: false, error: "wallet.errors.insufficientBalance" }
  }
  const feeKey = `${awayFeeKey(matchId, user.id)}_${crypto.randomUUID().slice(0, 8)}`
  const charged = await applyWalletMovement({
    userId: user.id,
    amount: -MATCH_FEE_BDT,
    idempotencyKey: feeKey,
    entryType: "match_fee",
    matchId,
    description: "match fee (away challenge)",
  })
  if (!charged) {
    return { ok: false, error: "wallet.errors.insufficientBalance" }
  }

  await db
    .insert(opponentRequests)
    .values({
      matchId,
      teamId,
      sentBy: user.id,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [opponentRequests.matchId, opponentRequests.teamId],
      set: { sentBy: user.id, status: "pending", respondedAt: null },
      setWhere: ne(opponentRequests.status, "pending"),
    })

  const [turfRow] = await db
    .select({ name: turfs.name })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(eq(bookings.id, match.bookingId))
    .limit(1)
  await createNotifications(
    {
      type: "match.challenge_received",
      payload: {
        matchId,
        teamName: await teamName(teamId),
        captainName: await userDisplayName(user.id),
        turfName: turfRow?.name ?? "",
      },
      entityType: "match",
      entityId: matchId,
    },
    [match.captainId]
  )

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Accept or reject a pending team challenge — home captain only. Accepting
 * takes the away side through the SAME atomic conditional UPDATE as the
 * person-based claim (first come, first served between a person claim, a
 * person accept, and every pending challenge), then seats the team's members
 * on the away side inside one guarded INSERT: it only lands while the claim
 * actually succeeded AND the away side still has room, so a bigger squad of
 * members than seats fills exactly what's free (captain-FCFS order). Every
 * other pending challenge is auto-cancelled once a side is taken.
 */
export async function respondTeamChallengeAction(
  matchId: string,
  teamId: string,
  accept: boolean
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if ((await resolveSideCaptain(match, user.id)) !== "home") {
    return forbidden()
  }

  const [challenge] = await db
    .select()
    .from(opponentRequests)
    .where(
      and(
        eq(opponentRequests.matchId, matchId),
        eq(opponentRequests.teamId, teamId)
      )
    )
    .limit(1)
  if (!challenge) return { ok: false, error: "matches.errors.challengeNotFound" }
  if (challenge.status !== "pending") {
    return { ok: false, error: "matches.errors.challengeNoLongerPending" }
  }

  const senderId =
    challenge.sentBy ?? (await fallbackTeamCaptain(teamId)) ?? match.captainId

  if (!accept) {
    await db
      .update(opponentRequests)
      .set({ status: "rejected", respondedAt: new Date() })
      .where(
        and(
          eq(opponentRequests.matchId, matchId),
          eq(opponentRequests.teamId, teamId),
          eq(opponentRequests.status, "pending")
        )
      )
    // Fee credit-back: when the sender's LAST pending challenge for this
    // match dies, their latest live ৳25 hold returns to the wallet
    // (idempotent per-entry key).
    const [stillPending] = await db
      .select({ teamId: opponentRequests.teamId })
      .from(opponentRequests)
      .where(
        and(
          eq(opponentRequests.matchId, matchId),
          eq(opponentRequests.sentBy, senderId),
          eq(opponentRequests.status, "pending")
        )
      )
      .limit(1)
    if (!stillPending) {
      const hold = await latestAwayFeeEntry(matchId, senderId)
      if (hold) {
        await creditFeeEntry(hold.id)
      }
    }
    await createNotifications(
      {
        type: "match.challenge_declined",
        payload: { matchId, teamName: await teamName(teamId) },
        entityType: "match",
        entityId: matchId,
      },
      [senderId]
    )
    revalidatePath(`/matches/${matchId}`)
    return { ok: true }
  }

  // Captain-FCFS order: the sending captain (or fallback) first, then the
  // rest by join order.
  const members = await listTeamMembers(teamId)
  const ordered = [
    ...members.filter((m) => m.userId === senderId),
    ...members.filter((m) => m.userId !== senderId),
  ].filter((m) => m.userId !== match.captainId) // never seat the home captain against themselves

  const cap = match.squadSize ?? FORMATS.fives.maxSquad
  const starters = isMatchFormat(match.matchType)
    ? startersOf(match.matchType)
    : FORMATS.fives.starters
  const memberRows = ordered.slice(0, cap).map((m, i) => ({
    userId: m.userId,
    squadRole: i < starters ? "starting" : "substitute",
  }))

  await db.batch([
    lockMatchForSeatClaim(matchId),
    // The away-side claim — same single-row race guard as claimOpponentSide.
    db.execute(sql`
      UPDATE matches
      SET away_captain_id = ${senderId}::uuid,
          away_placeholder_count = 0,
          state = 'confirmed',
          updated_at = now()
      WHERE id = ${matchId} AND state = 'open' AND away_captain_id IS NULL
    `),
    // Seat the squad only while the claim above actually landed AND the away
    // side still has room. `ord` makes the per-row capacity check incremental
    // within this one snapshot: each member needs `ord` seats taken or free.
    db.execute(sql`
      INSERT INTO match_players (match_id, user_id, side, role, squad_role)
      SELECT ${matchId}, v.uid, 'away', 'member', v.srole
      FROM (VALUES ${sql.join(
        memberRows.map((r, i) =>
          sql`(${r.userId}::uuid, ${r.squadRole}::squad_role, ${i + 1}::int)`
        ),
        sql`, `
      )}) AS v(uid, srole, ord)
      WHERE EXISTS (
        SELECT 1 FROM matches
        WHERE id = ${matchId}
          AND away_captain_id = ${senderId}::uuid
          AND state = 'confirmed'
      ) AND v.ord + (
        SELECT count(*) FROM match_players
        WHERE match_id = ${matchId} AND side = 'away'
      ) <= COALESCE((
        SELECT squad_size FROM matches WHERE id = ${matchId}
      ), ${FORMATS.fives.maxSquad})
      ON CONFLICT DO NOTHING
    `),
    db.execute(sql`
      UPDATE opponent_requests
      SET status = 'accepted', responded_at = now()
      WHERE match_id = ${matchId} AND team_id = ${teamId} AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM matches
          WHERE id = ${matchId} AND away_captain_id = ${senderId}::uuid
        )
    `),
    db.execute(sql`
      UPDATE opponent_requests
      SET status = 'cancelled', responded_at = now()
      WHERE match_id = ${matchId} AND team_id <> ${teamId} AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM matches
          WHERE id = ${matchId} AND away_captain_id = ${senderId}::uuid
        )
    `),
  ])

  const [accepted] = await db
    .select({ status: opponentRequests.status })
    .from(opponentRequests)
    .where(
      and(
        eq(opponentRequests.matchId, matchId),
        eq(opponentRequests.teamId, teamId)
      )
    )
    .limit(1)
  if (accepted?.status !== "accepted") {
    // The away side went to someone else first — this challenge is now moot.
    await db
      .update(opponentRequests)
      .set({ status: "cancelled", respondedAt: new Date() })
      .where(
        and(
          eq(opponentRequests.matchId, matchId),
          eq(opponentRequests.teamId, teamId),
          eq(opponentRequests.status, "pending")
        )
      )
    return { ok: false, error: "matches.errors.matchJustTaken" }
  }

  await createNotifications(
    {
      type: "match.challenge_accepted",
      payload: { matchId, teamName: await teamName(teamId) },
      entityType: "match",
      entityId: matchId,
    },
    [senderId]
  )
  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Start the match: either side's captain flips the confirmed fixture to
 * ONGOING whenever they're ready. Pending invitations deliberately don't
 * block start — whoever never responded is simply not on the final roster
 * (their invite stays pending and can still claim an opened seat until the
 * roster closes). The conditional UPDATE is the authority: the roster shown
 * at kick-off is exactly the match_players/match_guests rows.
 */
export async function startMatchAction(matchId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!(await resolveSideCaptain(match, user.id))) return forbidden()

  const started = await db
    .update(matches)
    .set({ state: "ongoing", updatedAt: new Date() })
    .where(
      and(
        eq(matches.id, matchId),
        inArray(matches.state, ["confirmed", "roster_building", "ready"])
      )
    )
    .returning({ id: matches.id })
  if (started.length === 0) {
    return { ok: false, error: "matches.errors.matchNotStartable" }
  }

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/** Team name for notification payloads (empty string when the team vanished). */
async function teamName(teamId: string): Promise<string> {
  const [row] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1)
  return row?.name ?? ""
}

/**
 * Away-captain fallback for legacy challenge rows without a sender: the
 * team's oldest captain-role member.
 */
async function fallbackTeamCaptain(teamId: string): Promise<string | null> {
  const members = await listTeamMembers(teamId)
  return (
    members.find((m) => isCaptainRole(m.role))?.userId ??
    members[0]?.userId ??
    null
  )
}

/**
 * Captain-initiated match cancellation (fall-through path). Either side's
 * captain can cancel before kickoff while the game hasn't started; both paid
 * matchmaking fees are credited back to the paying captains' wallets, and
 * the other captain is notified.
 */
const CANCELLABLE_STATES = ["open", "confirmed", "roster_building", "ready"] as const

export async function cancelMatchAction(matchId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.captainId !== user.id && match.awayCaptainId !== user.id) {
    return forbidden()
  }
  if (!CANCELLABLE_STATES.includes(match.state as (typeof CANCELLABLE_STATES)[number])) {
    return { ok: false, error: "matches.errors.matchNotCancellable" }
  }

  const updated = await db
    .update(matches)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(matches.id, matchId),
        inArray(matches.state, [...CANCELLABLE_STATES])
      )
    )
    .returning({ id: matches.id })
  if (updated.length === 0) {
    return { ok: false, error: "matches.errors.matchNotCancellable" }
  }

  // Fall-through: both fees go back to their payers (idempotent).
  if (shouldCreditMatchFees("cancelled")) {
    await creditMatchFees(matchId)
  }

  // Notify the OTHER captain (best-effort).
  const otherId =
    user.id === match.captainId ? match.awayCaptainId : match.captainId
  if (otherId) {
    await createNotifications(
      {
        type: "match.cancelled",
        payload: { matchId },
        entityType: "match",
        entityId: matchId,
      },
      [otherId]
    ).catch(() => {})
  }

  revalidatePath("/matches")
  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * Live event log (goal / save / tackle / note). Either side's captain, or
 * the captain-assigned recorder, may write while the match is ongoing. The
 * event's side and display name are derived from the resolved roster row —
 * never taken from the client.
 */
export async function logMatchEventAction(
  input: z.infer<typeof logMatchEventSchema>
): Promise<ActionResult & { id?: string }> {
  const parsed = logMatchEventSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "errors.invalid",
    }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { matchId, eventType, playerRef, note } = parsed.data
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (match.state !== "ongoing") {
    return { ok: false, error: "matches.errors.matchNotLive" }
  }

  const side = await resolveSideCaptain(match, user.id)
  if (
    !canLogMatchEvents({ side, recorderId: match.recorderId, userId: user.id })
  ) {
    return forbidden()
  }

  // Resolve the roster identity within THIS match; stat events require one.
  let playerUserId: string | null = null
  let playerGuestId: string | null = null
  let playerName: string | null = null
  let eventSide: "home" | "away" | null = null
  if (eventType !== "note") {
    if (!playerRef) {
      return { ok: false, error: "matches.errors.playerNotInMatch" }
    }
    const ref = parsePlayerRef(playerRef)
    if (!ref) return { ok: false, error: "matches.errors.playerNotInMatch" }

    if (ref.kind === "player") {
      const [row] = await db
        .select({
          userId: matchPlayers.userId,
          name: users.name,
          phone: users.phone,
          side: matchPlayers.side,
        })
        .from(matchPlayers)
        .innerJoin(users, eq(users.id, matchPlayers.userId))
        .where(
          and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, ref.id))
        )
        .limit(1)
      if (!row) return { ok: false, error: "matches.errors.playerNotInMatch" }
      playerUserId = row.userId
      eventSide = row.side
      playerName = row.name ?? (row.phone ? maskPhone(row.phone) : null)
    } else {
      const [row] = await db
        .select({
          id: matchGuests.id,
          name: matchGuests.name,
          side: matchGuests.side,
        })
        .from(matchGuests)
        .where(and(eq(matchGuests.id, ref.id), eq(matchGuests.matchId, matchId)))
        .limit(1)
      if (!row) return { ok: false, error: "matches.errors.playerNotInMatch" }
      playerGuestId = row.id
      eventSide = row.side
      playerName = row.name
    }
  }

  const [inserted] = await db
    .insert(matchEvents)
    .values({
      matchId,
      side: eventSide,
      eventType,
      minute: matchMinute(match.kickoffAt),
      playerUserId,
      playerGuestId,
      playerName,
      note: note ?? null,
      createdBy: user.id,
    })
    .returning({ id: matchEvents.id })

  revalidatePath(`/matches/${matchId}`)
  revalidatePath("/matches/logs")
  return { ok: true, id: inserted?.id }
}

/**
 * Remove a logged event — a shared correction surface for the loggers, kept
 * open after completion so a wrong entry can be fixed before the result is
 * confirmed.
 */
export async function deleteMatchEventAction(
  input: z.infer<typeof deleteMatchEventSchema>
): Promise<ActionResult> {
  const parsed = deleteMatchEventSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "errors.invalid",
    }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { matchId, eventId } = parsed.data
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!["ongoing", "completed"].includes(match.state)) {
    return { ok: false, error: "matches.errors.matchNotLive" }
  }

  const side = await resolveSideCaptain(match, user.id)
  if (
    !canLogMatchEvents({ side, recorderId: match.recorderId, userId: user.id })
  ) {
    return forbidden()
  }

  const [event] = await db
    .select({ id: matchEvents.id })
    .from(matchEvents)
    .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
    .limit(1)
  if (!event) return { ok: false, error: "matches.errors.eventNotFound" }

  await db.delete(matchEvents).where(eq(matchEvents.id, eventId))

  revalidatePath(`/matches/${matchId}`)
  revalidatePath("/matches/logs")
  return { ok: true }
}

/**
 * Assign (or clear) the live-event logger. Captains only; the delegate must
 * be a registered roster player of this match. Allowed while the roster is
 * open or the match is ongoing, so a delegate can be named before kickoff.
 */
export async function assignRecorderAction(
  input: z.infer<typeof assignRecorderSchema>
): Promise<ActionResult> {
  const parsed = assignRecorderSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "errors.invalid",
    }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { matchId, recorderId } = parsed.data
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }

  const side = await resolveSideCaptain(match, user.id)
  if (!canAssignRecorder({ side })) return forbidden()
  if (!rosterOpen(match.state) && match.state !== "ongoing") {
    return { ok: false, error: "matches.errors.rosterNotOpen" }
  }

  if (recorderId !== null) {
    const [row] = await db
      .select({ userId: matchPlayers.userId })
      .from(matchPlayers)
      .where(
        and(
          eq(matchPlayers.matchId, matchId),
          eq(matchPlayers.userId, recorderId)
        )
      )
      .limit(1)
    if (!row) return { ok: false, error: "matches.errors.recorderNotInMatch" }
  }

  await db
    .update(matches)
    .set({ recorderId, updatedAt: new Date() })
    .where(eq(matches.id, matchId))

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}
