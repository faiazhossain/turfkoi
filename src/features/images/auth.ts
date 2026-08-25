import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { teamMembers, turfs } from "@/db/schema"
import { can, type AuthUser } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"

import type { ImageContextKind } from "./service"

export type RightsResult = { ok: true; userId: string } | { ok: false; error: string }

/**
 * Shared authorization for every image route/action. The resource id from
 * the client is never trusted on its own — ownership is loaded from the DB
 * and checked with the capability layer:
 *   - turf  → turf_owner role + owns the turf (admins pass via can()).
 *   - team  → team_members role must be "owner".
 *   - player→ only the signed-in user themselves.
 */
export async function assertImageRights(
  user: AuthUser | null,
  context: ImageContextKind,
  resourceId: string
): Promise<RightsResult> {
  if (!user) return { ok: false, error: "You are not signed in." }

  if (context === "player") {
    if (resourceId !== user.id) {
      return { ok: false, error: "You can only manage your own avatar." }
    }
    return { ok: true, userId: user.id }
  }

  if (context === "team") {
    const rows = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, resourceId), eq(teamMembers.userId, user.id))
      )
      .limit(1)
    const teamRole = rows[0]?.role ?? null
    if (!can(user, "team.update", { teamRole })) {
      return { ok: false, error: "Only the team owner can manage the logo." }
    }
    return { ok: true, userId: user.id }
  }

  // turf
  if (!user.roles.includes("turf_owner") && !user.roles.includes("admin")) {
    return { ok: false, error: "Turf owners only." }
  }
  const rows = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, resourceId))
    .limit(1)
  const turf = rows[0]
  if (!turf) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: turf.ownerId })) {
    return { ok: false, error: "You can only manage your own turf's photos." }
  }
  return { ok: true, userId: user.id }
}

/** Session user for image routes (never trust the client's user id). */
export async function imageActor(): Promise<AuthUser | null> {
  return getCurrentUser()
}
