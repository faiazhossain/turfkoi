"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { headers } from "next/headers"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { turfClaimInvites, turfs, userRoles } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit } from "@/lib/ratelimit"

import { emailProvider } from "@/features/auth/email-provider"
import {
  CLAIM_COOKIE,
  claimPath,
  createClaimInvite,
  resolveClaimToken,
} from "./invites"
import {
  claimTurfSchema,
  createInviteSchema,
  seedTurfSchema,
  type SeedTurfValues,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "You are not signed in." }
}

// Local mirror of the admin gate in features/admin/actions.ts (not exported
// there — "use server" modules export only actions).
async function adminActor(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You are not signed in." }
  if (!user.roles.includes("admin")) {
    return { ok: false, error: "Admins only." }
  }
  return { ok: true, id: user.id }
}

/**
 * Admin seeds a basic, unowned turf listing. `ownerId` stays NULL (unclaimed)
 * and `isVerified` false, so the turf is invisible publicly until the owner
 * claims it and completes the listing.
 */
export async function seedTurfAction(
  input: SeedTurfValues
): Promise<ActionResult> {
  const parsed = seedTurfSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const actor = await adminActor()
  if (!actor.ok) return actor

  const { coords, ...rest } = parsed.data
  try {
    const [created] = await db
      .insert(turfs)
      .values({ ...rest, coords, ownerId: null, isVerified: false })
      .returning({ id: turfs.id })
    revalidatePath("/admin/turfs")
    return { ok: true, id: created.id }
  } catch (err) {
    if (String(err).includes("unique")) {
      return { ok: false, error: "That slug is already taken." }
    }
    throw err
  }
}

/**
 * Mint a single-use claim invite for an unclaimed turf. The plaintext link
 * is returned once (only the hash is stored). Re-invites revoke the previous
 * link. If a target email is given, the link is also emailed; an email
 * failure is surfaced but does not discard the invite — the admin can copy
 * the link manually.
 */
export async function createClaimInviteAction(input: {
  turfId: string
  targetEmail?: string
}): Promise<
  | { ok: true; path: string; expiresAt: Date; emailed: boolean }
  | { ok: false; error: string }
> {
  const parsed = createInviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const actor = await adminActor()
  if (!actor.ok) return actor

  const turfRows = await db
    .select({ id: turfs.id, name: turfs.name, ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, parsed.data.turfId))
    .limit(1)
  const turf = turfRows[0]
  if (!turf) return { ok: false, error: "Turf not found." }
  if (turf.ownerId !== null) {
    return { ok: false, error: "That turf has already been claimed." }
  }

  const { token, expiresAt } = await createClaimInvite(
    actor.id,
    turf.id,
    parsed.data.targetEmail
  )
  revalidatePath("/admin/turfs")

  let emailed = false
  if (parsed.data.targetEmail) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
    try {
      await emailProvider.sendTurfClaimInvite(
        parsed.data.targetEmail,
        turf.name,
        `${base}${claimPath(token)}`,
        expiresAt
      )
      emailed = true
    } catch (err) {
      console.error("[turf-claims] invite email failed:", err)
      // Deliberate partial success: the link works, email didn't go out.
      return { ok: true, path: claimPath(token), expiresAt, emailed: false }
    }
  }

  return { ok: true, path: claimPath(token), expiresAt, emailed }
}

/**
 * Claim a seeded turf. Single-statement conditional updates keep the race
 * safe without a transaction (neon-http has none): only one caller can flip
 * `owner_id` from NULL, and only one can consume the invite.
 */
export async function claimTurfAction(token: string): Promise<ActionResult> {
  const parsed = claimTurfSchema.safeParse({ token })
  if (!parsed.success) return { ok: false, error: "Invalid claim link." }

  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const allow = await rateLimit(`claim:ip:${ip}`, 10, 300) // 10 / 5min / IP
  if (!allow) return { ok: false, error: "Too many attempts. Try again later." }

  const resolved = await resolveClaimToken(parsed.data.token)
  if (!resolved.ok) {
    const messages: Record<typeof resolved.reason, string> = {
      invalid: "This claim link isn't valid. Ask the admin for a new one.",
      expired: "This claim link has expired. Ask the admin for a new one.",
      claimed: "This turf has already been claimed.",
      revoked: "This claim link was replaced by a newer one.",
      turf_claimed: "This turf has already been claimed.",
    }
    return { ok: false, error: messages[resolved.reason] }
  }

  // Flip ownership atomically — 0 rows means someone claimed concurrently.
  const claimedTurf = await db
    .update(turfs)
    .set({ ownerId: user.id, updatedAt: new Date() })
    .where(and(eq(turfs.id, resolved.turfId), isNull(turfs.ownerId)))
    .returning({ id: turfs.id })
  if (claimedTurf.length === 0) {
    return { ok: false, error: "This turf has already been claimed." }
  }

  // Grant the turf_owner role (idempotent; same pattern as setUserRoleAction).
  await db
    .insert(userRoles)
    .values({ userId: user.id, role: "turf_owner" })
    .onConflictDoNothing()

  // Consume the invite (conditional, idempotent under race).
  await db
    .update(turfClaimInvites)
    .set({ claimedAt: new Date(), claimedBy: user.id })
    .where(
      and(eq(turfClaimInvites.id, resolved.inviteId), isNull(turfClaimInvites.claimedAt))
    )

  // Drop the pending-claim cookie, if any.
  const store = await cookies()
  store.delete(CLAIM_COOKIE)

  revalidatePath("/admin/turfs")
  revalidatePath("/turf-owner")
  return { ok: true, id: resolved.turfId }
}
