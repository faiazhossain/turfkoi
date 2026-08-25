"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { headers } from "next/headers"
import { and, desc, eq, isNull } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { AuthError } from "next-auth"

import { signIn } from "@/auth"
import { db } from "@/db"
import { turfApplications, turfClaimInvites, turfs, userRoles, users } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit } from "@/lib/ratelimit"

import { emailProvider } from "@/features/auth/email-provider"
import {
  CLAIM_COOKIE,
  claimPath,
  createClaimInvite,
  resolveClaimToken,
  verifyClaimOtp,
} from "./invites"
import { findOrCreateOwnerByPhone, generateSimplePassword } from "./owner-account"
import {
  claimOtpSchema,
  claimPasswordSchema,
  claimTurfSchema,
  createInviteSchema,
  seedTurfSchema,
  type SeedTurfValues,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}

// Local mirror of the admin gate in features/admin/actions.ts (not exported
// there — "use server" modules export only actions).
async function adminActor(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }
  if (!user.roles.includes("admin")) {
    return { ok: false, error: "errors.adminOnly" }
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
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
      return { ok: false, error: "turfs.errors.slugTaken" }
    }
    throw err
  }
}

/**
 * Mint a single-use claim invite for an unclaimed turf. The plaintext link
 * (and, with a phone, the one-time OTP) is returned once — only hashes are
 * stored. Re-invites revoke the previous link and its OTP. If a target
 * email is given, the link is also emailed; an email failure is surfaced
 * but does not discard the invite — the admin can copy the link manually.
 */
export async function createClaimInviteAction(input: {
  turfId: string
  targetEmail?: string
  targetPhone?: string
}): Promise<
  | {
      ok: true
      path: string
      expiresAt: Date
      emailed: boolean
      otp: string | null
      phone: string | null
      turfName: string
    }
  | { ok: false; error: string }
> {
  const parsed = createInviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const actor = await adminActor()
  if (!actor.ok) return actor

  const turfRows = await db
    .select({ id: turfs.id, name: turfs.name, ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, parsed.data.turfId))
    .limit(1)
  const turf = turfRows[0]
  if (!turf) return { ok: false, error: "turfs.errors.turfNotFound" }
  if (turf.ownerId !== null) {
    return { ok: false, error: "That turf has already been claimed." }
  }

  // Phone the admin typed wins; otherwise fall back to the phone the owner
  // gave in their application, so the OTP login flow is on for every turf
  // that came through /own-a-turf without anyone retyping numbers.
  let targetPhone = parsed.data.targetPhone
  if (!targetPhone) {
    const appRows = await db
      .select({ phone: turfApplications.phone })
      .from(turfApplications)
      .where(eq(turfApplications.turfId, turf.id))
      .orderBy(desc(turfApplications.createdAt))
      .limit(1)
    targetPhone = appRows[0]?.phone
  }

  const { token, otp, expiresAt } = await createClaimInvite(
    actor.id,
    turf.id,
    parsed.data.targetEmail,
    targetPhone
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
        expiresAt,
        otp ?? undefined
      )
      emailed = true
    } catch (err) {
      console.error("[turf-claims] invite email failed:", err)
      // Deliberate partial success: the link works, email didn't go out.
      return {
        ok: true,
        path: claimPath(token),
        expiresAt,
        emailed: false,
        otp,
        phone: targetPhone ?? null,
        turfName: turf.name,
      }
    }
  }

  return {
    ok: true,
    path: claimPath(token),
    expiresAt,
    emailed,
    otp,
    phone: targetPhone ?? null,
    turfName: turf.name,
  }
}

/**
 * Claim a seeded turf. Single-statement conditional updates keep the race
 * safe without a transaction (neon-http has none): only one caller can flip
 * `owner_id` from NULL, and only one can consume the invite.
 */
export async function claimTurfAction(token: string): Promise<ActionResult> {
  const parsed = claimTurfSchema.safeParse({ token })
  if (!parsed.success) return { ok: false, error: "claim.errors.invalidLink" }

  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const allow = await rateLimit(`claim:ip:${ip}`, 10, 300) // 10 / 5min / IP
  if (!allow) return { ok: false, error: "errors.rateLimited" }

  const resolved = await resolveClaimToken(parsed.data.token)
  if (!resolved.ok) {
    const messages: Record<typeof resolved.reason, string> = {
      invalid: "claim.errors.invalidLink",
      expired: "claim.errors.linkExpired",
      claimed: "turfs.errors.alreadyClaimed",
      revoked: "claim.errors.linkReplaced",
      turf_claimed: "turfs.errors.alreadyClaimed",
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
    return { ok: false, error: "turfs.errors.alreadyClaimed" }
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

/**
 * WhatsApp OTP first-login for turf owners. The claim link + the 6-digit
 * code from the admin's WhatsApp message jointly prove control of the
 * phone, so this signs the owner straight in — finding or creating their
 * account — and the client then walks them through the password modal +
 * claim. The one-time password exists only inside this request.
 */
export async function claimOtpLoginAction(
  token: string,
  code: string
): Promise<ActionResult> {
  const parsed = claimOtpSchema.safeParse({ token, code })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const allowIp = await rateLimit(`claim-otp:ip:${ip}`, 10, 300)
  if (!allowIp) {
    return { ok: false, error: "errors.rateLimited" }
  }

  const verified = await verifyClaimOtp(parsed.data.token, parsed.data.code)
  if (!verified.ok) {
    // A malformed token surfaces as `invalid` without attemptsLeft — give
    // it link-level copy instead of the wrong-code message.
    if (verified.reason === "invalid" && verified.attemptsLeft === undefined) {
      return { ok: false, error: "claim.errors.invalidLink" }
    }
    const messages: Record<typeof verified.reason, string> = {
      invalid:
        verified.attemptsLeft !== undefined
          ? verified.attemptsLeft === 1
            ? "claim.errors.wrongCodeOne"
            : "claim.errors.wrongCode"
          : "claim.errors.wrongCode",
      locked: "claim.errors.locked",
      consumed: "claim.errors.consumed",
      expired: "claim.errors.linkExpired",
      claimed: "turfs.errors.alreadyClaimed",
      revoked: "claim.errors.linkReplaced",
      turf_claimed: "turfs.errors.alreadyClaimed",
      no_otp: "claim.errors.noOtp",
      rate_limited: "errors.rateLimited",
    }
    return { ok: false, error: messages[verified.reason] }
  }

  const allowInvite = await rateLimit(
    `claim-otp:invite:${verified.inviteId}`,
    10,
    300
  )
  if (!allowInvite) {
    return { ok: false, error: "errors.rateLimited" }
  }

  // Best-effort identity hints from the application that produced this
  // turf (contact name + email); manual seeds simply skip them.
  const appRows = await db
    .select({
      contactName: turfApplications.contactName,
      email: turfApplications.email,
    })
    .from(turfApplications)
    .where(
      and(
        eq(turfApplications.turfId, verified.turfId),
        eq(turfApplications.status, "approved")
      )
    )
    .orderBy(desc(turfApplications.createdAt))
    .limit(1)
  const app = appRows[0]

  const owner = await findOrCreateOwnerByPhone({
    phone: verified.phone,
    email: app?.email ?? null,
    name: app?.contactName ?? null,
  })

  try {
    // Reuses the hardened credentials provider: the one-time password is
    // garbage after this request and the modal replaces it right away.
    await signIn("credentials", {
      identifier: owner.phone,
      password: owner.oneTimePassword,
      redirect: false,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      console.error("[turf-claims] OTP sign-in failed:", err)
      return { ok: false, error: "claim.errors.signinFailed" }
    }
    throw err
  }

  return { ok: true }
}

/**
 * Set the owner's password after the claim OTP login. Auth-gated — the
 * caller is whoever just signed in via the OTP flow (or any signed-in user
 * changing their own password through the claim modal).
 */
export async function setClaimPasswordAction(
  password: string
): Promise<ActionResult> {
  const parsed = claimPasswordSchema.safeParse({ password })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }

  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id))
  return { ok: true }
}

/**
 * Skip path for the password modal: save a generated simple password and
 * return it once so the modal can show it to the owner. Nothing extra is
 * stored — this IS the account password until changed in settings.
 */
export async function skipClaimPasswordAction(): Promise<
  { ok: true; password: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const password = generateSimplePassword()
  const passwordHash = await bcrypt.hash(password, 10)
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id))
  return { ok: true, password }
}
