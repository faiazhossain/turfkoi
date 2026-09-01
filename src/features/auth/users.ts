import { eq, and, isNull } from "drizzle-orm"

import { db } from "@/db"
import {
  users,
  userRoles,
  playerProfiles,
  teamMembers,
  teamInvitations,
  matchInvitations,
  matchGuests,
} from "@/db/schema"
import type { Role } from "@/lib/capabilities"

import type { Identifier } from "./identifier"

export async function getUserByPhone(phone: string) {
  const rows = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  return rows[0] ?? null
}

export async function getUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return rows[0] ?? null
}

/** Resolve a login identifier (email or phone) to a user. */
export async function getUserByIdentifier(identifier: Identifier) {
  return identifier.kind === "email"
    ? getUserByEmail(identifier.email)
    : getUserByPhone(identifier.phone)
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const rows = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return rows.map((r) => r.role as Role)
}

/** Idempotent: ensures a player profile + default 'player' role exist. */
async function ensureProfileAndRole(userId: string): Promise<void> {
  await db.insert(playerProfiles).values({ userId }).onConflictDoNothing()
  await db
    .insert(userRoles)
    .values({ userId, role: "player" })
    .onConflictDoNothing()
  // Permanent public identity (DT-XXXXXX + @username) for the Player Network.
  const { ensurePlayerIdentity } = await import("@/features/player/identity")
  await ensurePlayerIdentity(userId).catch(() => {
    /* non-fatal: backfill script can repair legacy rows */
  })
}

/**
 * Phase 4: when a user signs up, fulfill any pending team invitations that
 * match their phone. Each fulfilled invite creates a team_members row and
 * marks the invitation as fulfilled (idempotent).
 */
async function fulfillPendingInvitations(userId: string, phone: string): Promise<void> {
  const pending = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.phone, phone),
        isNull(teamInvitations.fulfilledAt)
      )
    )
  if (pending.length === 0) return

  for (const inv of pending) {
    await db
      .insert(teamMembers)
      .values({ teamId: inv.teamId, userId, role: inv.role })
      .onConflictDoNothing()
    await db
      .update(teamInvitations)
      .set({ fulfilledAt: new Date() })
      .where(eq(teamInvitations.id, inv.id))
  }
}

/**
 * Match invitations sent to an unregistered phone, and temp guest rows
 * recorded with that phone, get linked to the real account on signup.
 * LINKING ONLY — the user still accepts/declines the invitation themselves
 * (unlike team invitations, which auto-fulfill into membership).
 */
async function linkMatchInvitationsAndGuests(userId: string, phone: string): Promise<void> {
  await db
    .update(matchInvitations)
    .set({ inviteeUserId: userId })
    .where(
      and(
        eq(matchInvitations.inviteePhone, phone),
        isNull(matchInvitations.inviteeUserId),
        eq(matchInvitations.status, "pending")
      )
    )
  await db
    .update(matchGuests)
    .set({ linkedUserId: userId })
    .where(and(eq(matchGuests.phone, phone), isNull(matchGuests.linkedUserId)))
}

export interface RegisterUserInput {
  name: string
  phone: string
  email: string
  passwordHash: string
}

export type CreateUserResult =
  | { ok: true; user: { id: string; phone: string; name: string | null } }
  | { ok: false; reason: "phone_taken" | "email_taken" }

/**
 * Create a registered user (email verified, password set). Registration is the
 * only creation path now - the old find-or-create-on-OTP flow is gone.
 *
 * Resilient to races and partial creates (neon-http has no multi-statement
 * transactions) via unique(phone) / unique(email) + idempotent backfill of
 * profile + role.
 *
 * `refCode` (Phase 8 / A3) attributes the signup to a referrer. It is a no-op
 * on invalid / self-referral codes.
 */
export async function createRegisteredUser(
  input: RegisterUserInput,
  refCode?: string
): Promise<CreateUserResult> {
  const existingPhone = await getUserByPhone(input.phone)
  if (existingPhone) return { ok: false, reason: "phone_taken" }
  const existingEmail = await getUserByEmail(input.email)
  if (existingEmail) return { ok: false, reason: "email_taken" }

  try {
    const [created] = await db
      .insert(users)
      .values({
        name: input.name,
        phone: input.phone,
        email: input.email,
        passwordHash: input.passwordHash,
        emailVerifiedAt: new Date(),
      })
      .returning()
    await ensureProfileAndRole(created.id)
    // Fulfill any pending team invitations for this phone number.
    await fulfillPendingInvitations(created.id, input.phone)
    // Link match invitations / guests that were created for this phone.
    await linkMatchInvitationsAndGuests(created.id, input.phone).catch(() => {
      /* non-fatal */
    })
    // Attribute the signup to a referrer if a valid code was supplied.
    if (refCode) {
      const { attributeReferral } = await import("./referrals")
      await attributeReferral(refCode, created.id).catch(() => {
        /* non-fatal */
      })
    }
    return { ok: true, user: created }
  } catch (err) {
    // unique race: another request created the user first. Re-read to tell
    // phone from email so the form can show the right field error.
    const phoneAgain = await getUserByPhone(input.phone)
    if (phoneAgain) return { ok: false, reason: "phone_taken" }
    const emailAgain = await getUserByEmail(input.email)
    if (emailAgain) return { ok: false, reason: "email_taken" }
    throw err
  }
}

/** Password reset path: replace the hash after a verified email OTP. */
export async function updateUserPassword(
  userId: string,
  passwordHash: string
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
}
