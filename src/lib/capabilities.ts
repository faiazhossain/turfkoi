import type { userRole } from "@/db/schema"

export type Role = (typeof userRole.enumValues)[number]

export interface AuthUser {
  id: string
  roles: Role[]
}

export type Capability =
  | "team.update"
  | "team.member.manage"
  | "turf.update"
  | "booking.cancel"
  | "match.result.submit"

export interface CapabilityContext {
  teamId?: string
  /** The requesting user's role within the team (from team_members). */
  teamRole?: "owner" | "captain" | "manager" | "player" | null
  turfId?: string
  ownerId?: string
  bookerId?: string
  submitterId?: string
}

/**
 * Capability-based authorization (SS6): compute from roles + ownership at
 * request time, not from role names alone. Phase 1 wires real ownership lookups
 * (team_members / turf_owners rows) and integrates the session user.
 */
export function can(
  user: AuthUser | null,
  capability: Capability,
  ctx: CapabilityContext = {}
): boolean {
  if (!user) return false
  if (user.roles.includes("admin")) return true

  switch (capability) {
    case "turf.update":
      return user.roles.includes("turf_owner") && ctx.ownerId === user.id
    case "team.update":
      // Only the team owner can edit team settings (SS21).
      return ctx.teamRole === "owner"
    case "team.member.manage":
      // Owner or captain can manage the roster (SS21).
      return ctx.teamRole === "owner" || ctx.teamRole === "captain"
    case "booking.cancel":
      return ctx.bookerId === user.id || ctx.ownerId === user.id
    case "match.result.submit":
      return ctx.submitterId === user.id
    default:
      return false
  }
}
