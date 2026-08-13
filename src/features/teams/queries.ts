import "server-only"
import { and, asc, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { teams, teamMembers, users, teamInvitations } from "@/db/schema"
import type { teamMemberRole } from "@/db/schema"

export async function getTeamBySlug(slug: string) {
  const rows = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function getTeamById(id: string) {
  const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  return rows[0] ?? null
}

/** Teams where the user is a member, with their role in each. */
export async function listMyTeams(userId: string) {
  return db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
    .orderBy(asc(teams.name))
}

/** Member list for a team, with public user fields. */
export async function listTeamMembers(teamId: string) {
  return db
    .select({
      userId: users.id,
      phone: users.phone,
      name: users.name,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.joinedAt))
}

/** The requesting user's role in a team (null if not a member). */
export async function getTeamRole(
  teamId: string,
  userId: string
): Promise<(typeof teamMemberRole.enumValues)[number] | null> {
  const rows = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1)
  return rows[0]?.role ?? null
}

/** Count of members in a team. */
export async function countTeamMembers(teamId: string): Promise<number> {
  const rows = await db
    .select({ teamMembers })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))
  return rows.length
}

/** Pending invitations for a team. */
export async function listTeamInvitations(teamId: string) {
  return db
    .select({
      id: teamInvitations.id,
      phone: teamInvitations.phone,
      role: teamInvitations.role,
      createdAt: teamInvitations.createdAt,
    })
    .from(teamInvitations)
    .where(
      and(eq(teamInvitations.teamId, teamId), isNull(teamInvitations.fulfilledAt))
    )
    .orderBy(asc(teamInvitations.createdAt))
}
