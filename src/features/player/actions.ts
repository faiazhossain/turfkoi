"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  users,
  playerProfiles,
  playerRequests,
  matchPlayers,
  matches,
  bookings,
  turfs,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { roundCoords } from "@/lib/geo"
import { rosterOpen } from "@/features/matches/authority"
import { FORMATS, resolveSquadRole } from "@/features/matches/formats"
import { resolveSideCaptain } from "@/features/matches/queries"
import { lockMatchForSeatClaim, seatsFreeSql } from "@/features/matches/seat-claim"
import { createNotifications } from "@/features/notifications/create"

import { updateProfileSchema } from "./schemas"
import type { z } from "zod"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}

/** Toggle the "Available tonight" flag (SS18). */
export async function toggleAvailabilityAction(): Promise<
  ActionResult & { available?: boolean }
> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Ensure profile exists.
  await db
    .insert(playerProfiles)
    .values({ userId: user.id })
    .onConflictDoNothing()

  const [profile] = await db
    .select({ available: playerProfiles.available })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, user.id))
    .limit(1)

  const newValue = !profile?.available
  await db
    .update(playerProfiles)
    .set({ available: newValue, availableAt: new Date(), updatedAt: new Date() })
    .where(eq(playerProfiles.userId, user.id))

  revalidatePath("/app")
  return { ok: true, available: newValue }
}

export async function updateProfileAction(
  input: z.infer<typeof updateProfileSchema>
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { name, coords, avatarType, avatarPresetId, ...rest } = parsed.data

  if (name !== undefined) {
    await db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, user.id))
  }

  // Omitted keys leave stored values untouched (Drizzle's set() skips
  // undefined); explicit nulls clear. Coordinates are only written when the
  // caller actually sent them — an absent key must not wipe the pin.
  const set: Partial<typeof playerProfiles.$inferInsert> = {
    ...rest,
    updatedAt: new Date(),
  }
  if (coords !== undefined) {
    // F7 privacy: round player coords to 3 decimals (~110m) at write time.
    set.coords = coords ? roundCoords(coords) : null
  }
  if (avatarType === "preset" && avatarPresetId) {
    // Non-destructive: avatarPublicId is kept, so the photo comes back when
    // the player switches to photo mode.
    set.avatarType = "preset"
    set.avatarPresetId = avatarPresetId
  } else if (avatarType === "photo") {
    set.avatarType = "photo"
  }

  await db
    .insert(playerProfiles)
    .values({ userId: user.id, ...set })
    .onConflictDoUpdate({ target: playerProfiles.userId, set })

  revalidatePath("/app")
  revalidatePath("/app/profile")
  return { ok: true }
}

/**
 * Player requests to join a match (SS20). Creates a player_request
 * (status=pending); the request is match-level — whichever side's captain
 * accepts seats the player on their own side. Requests are accepted while
 * the roster is open. Both captains are notified of new requests.
 */
export async function requestToJoinAction(
  matchId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Match must be in an open roster state.
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.joinNotOpen" }
  }

  // The captains don't request to join their own match.
  if (
    match.captainId === user.id ||
    (match.awayCaptainId !== null && match.awayCaptainId === user.id)
  ) {
    return { ok: false, error: "matches.errors.ownMatch" }
  }

  // Can't request if already on the roster.
  const [existing] = await db
    .select()
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id))
    )
    .limit(1)
  if (existing) return { ok: false, error: "matches.errors.alreadyOnRoster" }

  // Idempotent: if a pending request already exists, no-op. returning() tells
  // us whether the row was actually created, so a repeated request doesn't
  // re-notify the captain.
  const inserted = await db
    .insert(playerRequests)
    .values({ matchId, userId: user.id, status: "pending" })
    .onConflictDoNothing()
    .returning({ userId: playerRequests.userId })

  if (inserted.length > 0) {
    const [turfRows, requesterRows] = await Promise.all([
      db
        .select({ name: turfs.name })
        .from(bookings)
        .innerJoin(turfs, eq(turfs.id, bookings.turfId))
        .where(eq(bookings.id, match.bookingId))
        .limit(1),
      db.select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1),
    ])
    await createNotifications(
      {
        type: "match.join_requested",
        payload: {
          matchId,
          playerName: requesterRows[0]?.name ?? "",
          turfName: turfRows[0]?.name ?? "",
        },
        entityType: "match",
        entityId: matchId,
      },
      [match.captainId, match.awayCaptainId].filter(
        (id): id is string => id !== null
      )
    )
  }

  revalidatePath(`/matches/${matchId}`)
  revalidatePath("/app")
  return { ok: true }
}

/**
 * Side captain accepts a player's join request. Creates a match_players row
 * on the ACCEPTING captain's own side and marks the request as accepted.
 */
export async function acceptPlayerRequestAction(
  matchId: string,
  playerId: string,
  side: "home" | "away"
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
    return { ok: false, error: "errors.noPermission" }
  }

  const [req] = await db
    .select()
    .from(playerRequests)
    .where(
      and(
        eq(playerRequests.matchId, matchId),
        eq(playerRequests.userId, playerId)
      )
    )
    .limit(1)
  if (!req) return { ok: false, error: "matches.errors.requestNotFound" }
  if (req.status !== "pending") {
    return { ok: false, error: "matches.errors.requestNotPending" }
  }

  // Squad capacity check — squadSize is per side; count-first placeholders
  // consume seats (pending invitations don't — seats go first-accept-wins).
  // Fast pre-check; the authoritative claim happens atomically in the batch
  // below. Seat as substitute once the side's starting slots are full.
  const { getSquadCounts } = await import("@/features/matches/queries")
  const { spotsLeft } = await import("@/features/matches/formats")
  const counts = await getSquadCounts(matchId)
  const sideCounts = counts.find((c) => c.side === side)
  const cap = match.squadSize ?? FORMATS.fives.maxSquad
  const free = spotsLeft(
    cap,
    sideCounts?.total ?? 0,
    sideCounts?.placeholders ?? 0
  )
  if (free < 1) {
    return { ok: false, error: "matches.errors.squadFull" }
  }
  const squadRole = resolveSquadRole(sideCounts?.starting ?? 0, match.matchType)

  // First-accept-wins claim, same batch shape as the invite accept: lock the
  // match row, insert the player only while the side has a free seat, and
  // mark the request accepted only if that insert landed. On a loss the
  // request stays pending so the captain can retry when a seat frees up.
  await db.batch([
    lockMatchForSeatClaim(matchId),
    db.execute(sql`
      INSERT INTO match_players (match_id, user_id, side, role, squad_role)
      SELECT ${matchId}, ${playerId}, ${side}, 'guest', ${squadRole}
      WHERE ${seatsFreeSql(matchId, side)}
      ON CONFLICT DO NOTHING
    `),
    db.execute(sql`
      UPDATE player_requests
      SET status = 'accepted'
      WHERE match_id = ${matchId} AND user_id = ${playerId}
        AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM match_players
          WHERE match_id = ${matchId}
            AND user_id = ${playerId}
            AND side = ${side}
        )
    `),
  ])
  const [seat] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(
      and(
        eq(matchPlayers.matchId, matchId),
        eq(matchPlayers.userId, playerId),
        eq(matchPlayers.side, side)
      )
    )
    .limit(1)
  if (!seat) {
    return { ok: false, error: "matches.errors.squadFull" }
  }

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

export async function rejectPlayerRequestAction(
  matchId: string,
  playerId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [req] = await db
    .select({ matchId: playerRequests.matchId })
    .from(playerRequests)
    .where(
      and(
        eq(playerRequests.matchId, matchId),
        eq(playerRequests.userId, playerId)
      )
    )
    .limit(1)
  if (!req) return { ok: false, error: "matches.errors.requestNotFound" }

  // Either side's captain.
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, req.matchId))
    .limit(1)
  if (!match || !(await resolveSideCaptain(match, user.id))) {
    return { ok: false, error: "matches.errors.notAuthorized" }
  }

  await db
    .update(playerRequests)
    .set({ status: "rejected" })
    .where(
      and(
        eq(playerRequests.matchId, matchId),
        eq(playerRequests.userId, playerId)
      )
    )

  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}

/**
 * A rostered player leaves a match on their own accord (opt-out after being
 * added). Not allowed for the captain — they own the match — and blocked
 * once the match is no longer in an open roster state.
 */
export async function leaveMatchAction(matchId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "matches.errors.matchNotFound" }
  if (!rosterOpen(match.state)) {
    return { ok: false, error: "matches.errors.leaveNotOpen" }
  }
  if (
    match.captainId === user.id ||
    (match.awayCaptainId !== null && match.awayCaptainId === user.id)
  ) {
    return { ok: false, error: "matches.errors.cannotLeaveAsCaptain" }
  }

  const [row] = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id))
    )
    .limit(1)
  if (!row) return { ok: false, error: "matches.errors.notOnMatchRoster" }

  await db
    .delete(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id))
    )

  revalidatePath(`/matches/${matchId}`)
  revalidatePath("/app")
  return { ok: true }
}

/**
 * F2: "I played" confirmation. Player confirms they participated in a
 * completed match. Idempotent.
 */
export async function confirmPlayedAction(matchId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Must be on the roster.
  const [mp] = await db
    .select()
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id))
    )
    .limit(1)
  if (!mp) return { ok: false, error: "matches.errors.notOnMatchRoster" }

  if (mp.playedConfirmedAt) return { ok: true }

  await db
    .update(matchPlayers)
    .set({ playedConfirmedAt: new Date() })
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id))
    )

  revalidatePath("/app")
  revalidatePath(`/matches/${matchId}`)
  return { ok: true }
}
