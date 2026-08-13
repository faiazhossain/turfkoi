"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  playerProfiles,
  playerRequests,
  matchPlayers,
  matchTeams,
  matches,
} from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { getTeamRole } from "@/features/teams/queries"
import { countRoster } from "@/features/matches/queries"
import { ROSTER_LIMITS } from "@/features/matches/schemas"

import { updateProfileSchema } from "./schemas"
import type { z } from "zod"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "You are not signed in." }
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { coords, ...rest } = parsed.data
  await db
    .insert(playerProfiles)
    .values({
      userId: user.id,
      ...rest,
      coords: coords
        ? { lat: coords.lat, lng: coords.lng } as unknown as null
        : undefined,
    })
    .onConflictDoUpdate({
      target: playerProfiles.userId,
      set: {
        ...rest,
        coords: coords
          ? ({ lat: coords.lat, lng: coords.lng } as unknown as null)
          : undefined,
        updatedAt: new Date(),
      },
    })

  revalidatePath("/app")
  return { ok: true }
}

/**
 * Player requests to join a match as a guest (SS20). Creates a
 * player_request (status=pending) for the captain to accept/reject.
 */
export async function requestToJoinAction(
  matchId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Match must be in roster_building or confirmed.
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "Match not found." }
  if (!["roster_building", "confirmed"].includes(match.state)) {
    return { ok: false, error: "This match isn't open for join requests." }
  }

  // Can't request if already on the roster.
  const [existing] = await db
    .select()
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, user.id))
    )
    .limit(1)
  if (existing) return { ok: false, error: "You're already on the roster." }

  // Idempotent: if a pending request already exists, no-op.
  await db
    .insert(playerRequests)
    .values({ matchId, userId: user.id, status: "pending" })
    .onConflictDoNothing()

  revalidatePath(`/matches/${matchId}`)
  revalidatePath("/app")
  return { ok: true }
}

/**
 * Captain accepts a player's join request. Creates a match_players row with
 * role=guest and marks the request as accepted.
 */
export async function acceptPlayerRequestAction(
  matchId: string,
  playerId: string,
  teamId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const role = await getTeamRole(teamId, user.id)
  if (role !== "owner" && role !== "captain") {
    return { ok: false, error: "You don't have permission to do that." }
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
  if (!req) return { ok: false, error: "Request not found." }
  if (req.status !== "pending") {
    return { ok: false, error: "Request is no longer pending." }
  }

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!match) return { ok: false, error: "Match not found." }

  // Roster limit check.
  const count = await countRoster(matchId, teamId)
  const limits = ROSTER_LIMITS[match.matchType] ?? ROSTER_LIMITS.fives
  if (count >= limits.max) {
    return { ok: false, error: `Roster is full (max ${limits.max}).` }
  }

  // Add as guest player.
  await db
    .insert(matchPlayers)
    .values({ matchId, userId: playerId, teamId, role: "guest" })
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
  if (!req) return { ok: false, error: "Request not found." }

  // Verify the user is captain/owner of a team in this match.
  const sides = await db
    .select()
    .from(matchTeams)
    .where(eq(matchTeams.matchId, req.matchId))
  let isCaptain = false
  for (const s of sides) {
    const r = await getTeamRole(s.teamId, user.id)
    if (r === "owner" || r === "captain") {
      isCaptain = true
      break
    }
  }
  if (!isCaptain) return { ok: false, error: "Not authorized." }

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
  if (!mp) return { ok: false, error: "You're not on this match roster." }

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
