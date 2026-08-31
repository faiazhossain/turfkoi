"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  users,
  playerProfiles,
  playerRequests,
  matchPlayers,
  matchTeams,
  matches,
  bookings,
  turfs,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { roundCoords } from "@/lib/geo"
import { getTeamRole } from "@/features/teams/queries"
import { isCaptainRole, rosterOpen } from "@/features/matches/authority"
import { FORMATS, resolveSquadRole } from "@/features/matches/formats"
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
 * Player requests to join a match as a guest (SS20). Creates a
 * player_request (status=pending) for the captain to accept/reject. Solo
 * matches accept requests while OPEN; team matches while CONFIRMED /
 * ROSTER_BUILDING. The captain is notified of new requests.
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

  // The captain doesn't request to join their own match.
  if (match.captainId === user.id) {
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
      [match.captainId]
    )
  }

  revalidatePath(`/matches/${matchId}`)
  revalidatePath("/app")
  return { ok: true }
}

/**
 * Captain accepts a player's join request. Creates a match_players row with
 * role=guest and marks the request as accepted. teamId selects which side the
 * guest joins; null (solo match) adds them without a team.
 */
export async function acceptPlayerRequestAction(
  matchId: string,
  playerId: string,
  teamId: string | null
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

  if (teamId) {
    const role = await getTeamRole(teamId, user.id)
    if (!isCaptainRole(role)) {
      return { ok: false, error: "errors.noPermission" }
    }
  } else if (match.captainId !== user.id) {
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

  // Squad capacity check — squadSize is per side; pending invitations and
  // count-first placeholders consume seats too. Seat as substitute once the
  // side's starting slots are full.
  const { getSquadCounts } = await import("@/features/matches/queries")
  const { spotsLeft } = await import("@/features/matches/formats")
  const counts = await getSquadCounts(matchId)
  const side = counts.find((c) => (c.teamId ?? null) === teamId)
  const cap = match.squadSize ?? FORMATS.fives.maxSquad
  const free = spotsLeft(
    cap,
    side?.total ?? 0,
    side?.pending ?? 0,
    side?.placeholders ?? 0
  )
  if (free < 1) {
    return { ok: false, error: "matches.errors.squadFull" }
  }
  const squadRole = resolveSquadRole(side?.starting ?? 0, match.matchType)

  // Add as guest player.
  await db
    .insert(matchPlayers)
    .values({ matchId, userId: playerId, teamId, role: "guest", squadRole })
    .onConflictDoNothing()

  // Mark request accepted.
  await db
    .update(playerRequests)
    .set({ status: "accepted" })
    .where(
      and(
        eq(playerRequests.matchId, matchId),
        eq(playerRequests.userId, playerId)
      )
    )

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

  // The match captain or the captain/owner of a team in this match.
  const [match] = await db
    .select({ captainId: matches.captainId })
    .from(matches)
    .where(eq(matches.id, req.matchId))
    .limit(1)
  let authorized = match?.captainId === user.id
  if (!authorized) {
    const sides = await db
      .select()
      .from(matchTeams)
      .where(eq(matchTeams.matchId, req.matchId))
    for (const s of sides) {
      const r = await getTeamRole(s.teamId, user.id)
      if (isCaptainRole(r)) {
        authorized = true
        break
      }
    }
  }
  if (!authorized) return { ok: false, error: "matches.errors.notAuthorized" }

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
  if (match.captainId === user.id) {
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
