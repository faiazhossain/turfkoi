"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import type { z } from "zod"

import { db } from "@/db"
import { teams, teamMembers, teamInvitations } from "@/db/schema"
import { can } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"
import { getUserByPhone } from "@/features/auth/users"

import {
  teamFormSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  transferOwnershipSchema,
} from "./schemas"
import { getTeamRole, getTeamById } from "./queries"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}
function forbidden(): ActionResult {
  return { ok: false, error: "errors.noPermission" }
}

/** Look up slug for revalidation; returns "" if team not found. */
async function teamSlug(teamId: string): Promise<string> {
  const t = await getTeamById(teamId)
  return t?.slug ?? ""
}

export async function createTeamAction(
  input: z.infer<typeof teamFormSchema>
): Promise<ActionResult & { slug?: string }> {
  const parsed = teamFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { name, slug } = parsed.data
  try {
    const [created] = await db
      .insert(teams)
      .values({ name, slug })
      .returning({ id: teams.id, slug: teams.slug })

    // Creator becomes the owner (F6: ownership lives in team_members only).
    await db.insert(teamMembers).values({
      teamId: created.id,
      userId: user.id,
      role: "owner",
    })

    revalidatePath("/team")
    return { ok: true, id: created.id, slug: created.slug }
  } catch (err) {
    if (String(err).includes("unique")) {
      return { ok: false, error: "team.errors.slugTaken" }
    }
    throw err
  }
}

export async function updateTeamAction(
  teamId: string,
  input: z.infer<typeof teamFormSchema>
): Promise<ActionResult> {
  const parsed = teamFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const teamRole = await getTeamRole(teamId, user.id)
  if (!can(user, "team.update", { teamId, teamRole })) return forbidden()

  const { name, slug } = parsed.data
  try {
    await db
      .update(teams)
      .set({ name, slug, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
    revalidatePath("/team")
    revalidatePath(`/team/${slug}`)
    return { ok: true }
  } catch (err) {
    if (String(err).includes("unique")) {
      return { ok: false, error: "team.errors.slugTaken" }
    }
    throw err
  }
}

/**
 * Add a member by phone number. If the user exists, they're inserted into
 * team_members immediately. If not, a team_invitations row is stored and
 * fulfilled automatically when the user signs up (Phase 4 invitation model).
 */
export async function addMemberAction(
  teamId: string,
  input: z.infer<typeof addMemberSchema>
): Promise<ActionResult> {
  const parsed = addMemberSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const teamRole = await getTeamRole(teamId, user.id)
  if (!can(user, "team.member.manage", { teamId, teamRole })) return forbidden()

  const { phone, role } = parsed.data
  const target = await getUserByPhone(phone)

  if (target) {
    // User exists → add immediately (idempotent).
    await db
      .insert(teamMembers)
      .values({ teamId, userId: target.id, role })
      .onConflictDoNothing()
  } else {
    // User doesn't exist → store a pending invitation.
    const existing = await db
      .select({ id: teamInvitations.id })
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.teamId, teamId),
          eq(teamInvitations.phone, phone)
        )
      )
      .limit(1)
    if (existing.length === 0) {
      await db.insert(teamInvitations).values({
        teamId,
        phone,
        role,
        invitedBy: user.id,
      })
    }
  }

  revalidatePath(`/team/${await teamSlug(teamId)}`)
  return { ok: true }
}

export async function updateMemberRoleAction(
  input: z.infer<typeof updateMemberRoleSchema>
): Promise<ActionResult> {
  const parsed = updateMemberRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { teamId, userId, role } = parsed.data
  const requesterRole = await getTeamRole(teamId, user.id)
  if (!can(user, "team.member.manage", { teamId, teamRole: requesterRole }))
    return forbidden()

  // Only an owner can promote someone to owner — that's a transfer.
  if (role === "owner") {
    return {
      ok: false,
      error: "team.errors.useTransfer",
    }
  }
  if (requesterRole !== "owner" && role === "captain") {
    return { ok: false, error: "team.errors.onlyOwnerCaptains" }
  }
  // Demoting yourself from owner is blocked — transfer first.
  if (userId === user.id && requesterRole === "owner") {
    return {
      ok: false,
      error: "team.errors.transferFirstRole",
    }
  }

  await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))

  revalidatePath(`/team/${await teamSlug(teamId)}`)
  return { ok: true }
}

/**
 * Transfer ownership to another member. The current owner becomes a captain.
 * Guardrail (SS21): an owner cannot leave without transferring first.
 */
export async function transferOwnershipAction(
  input: z.infer<typeof transferOwnershipSchema>
): Promise<ActionResult> {
  const parsed = transferOwnershipSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { teamId, newOwnerId } = parsed.data
  const requesterRole = await getTeamRole(teamId, user.id)
  if (requesterRole !== "owner") return forbidden()

  const targetRole = await getTeamRole(teamId, newOwnerId)
  if (!targetRole) return { ok: false, error: "team.errors.notAMember" }

  // Two conditional updates — idempotent; safe without a transaction.
  await db
    .update(teamMembers)
    .set({ role: "captain" })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
  await db
    .update(teamMembers)
    .set({ role: "owner" })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newOwnerId)))

  revalidatePath(`/team/${await teamSlug(teamId)}`)
  return { ok: true }
}

/**
 * Remove a member. Guardrail (SS21): the only owner cannot be removed —
 * they must transfer ownership first.
 */
export async function removeMemberAction(
  teamId: string,
  userId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const requesterRole = await getTeamRole(teamId, user.id)
  if (!can(user, "team.member.manage", { teamId, teamRole: requesterRole }))
    return forbidden()

  const targetRole = await getTeamRole(teamId, userId)
  if (targetRole === "owner") {
    return { ok: false, error: "team.errors.cantRemoveOwner" }
  }
  if (targetRole === "captain" && requesterRole !== "owner") {
    return { ok: false, error: "team.errors.onlyOwnerRemoveCaptains" }
  }

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))

  revalidatePath(`/team/${await teamSlug(teamId)}`)
  return { ok: true }
}
