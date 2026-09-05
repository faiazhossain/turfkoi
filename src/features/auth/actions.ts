"use server"

import { revalidatePath } from "next/cache"
import { AuthError } from "next-auth"
import { headers } from "next/headers"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { signIn, signOut } from "@/auth"
import { db } from "@/db"
import { users, playerProfiles } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { roundCoords } from "@/lib/geo"
import { rateLimit } from "@/lib/ratelimit"

import { resolveIdentifier } from "./identifier"
import { normalizePhone } from "./phone"
import { emailProvider } from "./email-provider"
import { sendOtp, verifyOtp } from "./otp-service"
import {
  CLAIM_COOKIE,
  claimPath,
  resolveClaimToken,
} from "@/features/turf-claims/invites"
import {
  MATCH_LINK_COOKIE,
  isMatchLinkPath,
} from "@/features/matches/constants"
import {
  createRegisteredUser,
  getUserByEmail,
  getUserByIdentifier,
  getUserByPhone,
  getUserRoles,
  updateUserPassword,
} from "./users"
import {
  registrationFormSchema,
  loginFormSchema,
  forgotPasswordFormSchema,
  resetPasswordFormSchema,
  otpFormSchema,
  onboardingFormSchema,
  changePasswordFormSchema,
  changePhoneFormSchema,
} from "./schemas"

const BCRYPT_COST = 10

type ActionResult =
  | {
      ok: true
      devCode?: string
      isNew?: boolean
      home?: string
      /** Dev-only: no account for this email — nothing was sent (prod keeps
       * the silent anti-enumeration ok). */
      devNoAccount?: boolean
    }
  | { ok: false; reason: string; retryAfterSeconds?: number }

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

/** Post-login routing by strongest role: admins land on the admin console,
 * turf owners on their dashboard - the player dashboard is player work.
 * A pending turf-claim invite (cookie set by /claim/[token] when visited
 * signed-out) takes precedence over the role home; after that, a match
 * invite link visited signed-out (cookie set by the proxy) routes straight
 * back to the match. The consumed match cookie is cleared here — the claim
 * cookie is cleared by the claim flow itself. */
async function homeForUser(userId: string): Promise<string> {
  const jar = await cookies()
  const claimToken = jar.get(CLAIM_COOKIE)?.value
  if (claimToken) {
    const resolved = await resolveClaimToken(claimToken)
    if (resolved.ok) return claimPath(claimToken)
  }
  const matchPath = jar.get(MATCH_LINK_COOKIE)?.value
  if (isMatchLinkPath(matchPath)) {
    jar.delete(MATCH_LINK_COOKIE)
    return matchPath
  }
  const roles = await getUserRoles(userId)
  return roles.includes("admin")
    ? "/admin"
    : roles.includes("turf_owner")
      ? "/turf-owner"
      : "/app"
}

/**
 * Step 1 of registration: validate the details and send a verification code
 * to the email. The account is only created once the code is verified
 * (verifyRegistrationAction).
 *
 * Anti-enumeration: this step never reports phone_taken/email_taken —
 * probing it must look identical whether or not the identifiers are
 * registered (same parity as requestPasswordResetAction). A registration
 * attempt on a taken email gets an "account already exists" notice in that
 * inbox, which is where the real owner would look for the OTP anyway; the
 * rate-limit buckets are shared with OTP sends so probing a taken address
 * costs exactly as much as probing a free one. A taken phone surfaces in
 * step 2, where finding it costs one verified OTP per probe instead of a
 * single free request.
 */
export async function startRegistrationAction(
  input: z.input<typeof registrationFormSchema>
): Promise<ActionResult> {
  const parsed = registrationFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "errors.generic" }
  }
  const { email } = parsed.data

  if (await getUserByEmail(email)) {
    const ip = await clientIp()
    const allowEmail = await rateLimit(`otp:send:${email}`, 1, 60)
    const allowIp = await rateLimit(`otp:send-ip:${ip}`, 5, 600)
    if (!allowEmail || !allowIp) return { ok: false, reason: "rate_limited" }
    await emailProvider
      .sendAlreadyRegisteredNotice(email)
      .catch((err) => {
        // The response must not differ from a successful send (that would
        // re-open the enumeration oracle) - a failed notice is logged only.
        console.error("[auth] already-registered notice failed:", err)
      })
    return { ok: true }
  }

  const result = await sendOtp(email)
  if (result.ok) return { ok: true, devCode: result.devCode }
  return result.reason === "locked"
    ? { ok: false, reason: "locked", retryAfterSeconds: result.retryAfterSeconds }
    : { ok: false, reason: result.reason }
}

/**
 * Step 2 of registration: verify the emailed code, create the account, and
 * sign the user in. The client re-posts the details from step 1 so no
 * plaintext password is ever parked in a cookie or the DB unhashed.
 *
 * The phone/email checks below are race guards, not the primary taken-signals
 * (step 1 is deliberately silent — anti-enumeration). Reaching them requires
 * verifying an emailed OTP first, so they leak nothing a single free request
 * could reveal.
 */
export async function verifyRegistrationAction(
  input: z.input<typeof registrationFormSchema>,
  rawCode: string
): Promise<ActionResult> {
  const parsed = registrationFormSchema.safeParse(input)
  const parsedCode = otpFormSchema.safeParse({ code: rawCode })
  if (!parsed.success || !parsedCode.success) {
    return { ok: false, reason: "invalid_input_restart" }
  }
  const { name, phone, email, password } = parsed.data
  const normalizedPhone = normalizePhone(phone)

  if (await getUserByPhone(normalizedPhone)) {
    return { ok: false, reason: "phone_taken" }
  }
  if (await getUserByEmail(email)) return { ok: false, reason: "email_taken" }

  const verified = await verifyOtp(email, rawCode.trim())
  if (!verified.ok) {
    return verified.reason === "locked"
      ? { ok: false, reason: "locked", retryAfterSeconds: verified.retryAfterSeconds }
      : { ok: false, reason: verified.reason }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  // A3: pull the referral code from the cookie (set by /invite/[code]).
  const refCode = (await cookies()).get("deshiturf_ref")?.value || undefined
  const created = await createRegisteredUser(
    { name, phone: normalizedPhone, email, passwordHash },
    refCode
  )
  if (!created.ok) return { ok: false, reason: created.reason }

  try {
    await signIn("credentials", { identifier: email, password, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      // Only a CredentialsSignin rejection means the credentials were checked
      // and rejected. Any other AuthError (UntrustedHost, MissingSecret,
      // CallbackRouteError, ...) is a config/runtime fault - surface it in the
      // logs instead of masking it as a wrong code.
      if (err.type === "CredentialsSignin") {
        return { ok: false, reason: "signin_failed" }
      }
      console.error("[auth] signIn failed:", err.type, err.message ?? err.cause)
      return { ok: false, reason: "signin_failed" }
    }
    throw err
  }
  // Fresh account: always finish onboarding before anything else.
  return { ok: true, isNew: true, home: "/auth/onboarding" }
}

export async function loginAction(
  rawIdentifier: string,
  password: string
): Promise<ActionResult> {
  // Generic "invalid_credentials" for every failure path - never reveal
  // whether a phone/email is registered (anti-enumeration).
  const ip = await clientIp()
  const allowId = await rateLimit(`login:${rawIdentifier.trim().toLowerCase()}`, 10, 300)
  const allowIp = await rateLimit(`login-ip:${ip}`, 20, 300)
  if (!allowId || !allowIp) return { ok: false, reason: "rate_limited" }

  const parsed = loginFormSchema.safeParse({ identifier: rawIdentifier, password })
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" }

  try {
    await signIn("credentials", { ...parsed.data, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") {
        return { ok: false, reason: "invalid_credentials" }
      }
      console.error("[auth] signIn failed:", err.type, err.message ?? err.cause)
      return { ok: false, reason: "signin_failed" }
    }
    throw err
  }

  const identifier = resolveIdentifier(parsed.data.identifier)
  if (!identifier) return { ok: false, reason: "invalid_credentials" }
  const user = await getUserByIdentifier(identifier)
  if (!user) return { ok: false, reason: "invalid_credentials" }
  return { ok: true, home: await homeForUser(user.id) }
}

/**
 * Password reset step 1. Always returns ok whether or not the email is
 * registered - the response must not let anyone probe which addresses have
 * accounts. The code simply is not sent for unknown emails.
 */
export async function requestPasswordResetAction(rawEmail: string): Promise<ActionResult> {
  const parsed = forgotPasswordFormSchema.safeParse({ email: rawEmail })
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "errors.generic" }

  const user = await getUserByEmail(parsed.data.email)
  if (!user) {
    // Production stays silent (anti-enumeration); dev surfaces the miss so a
    // tester does not stare at the code box with no code ever sent.
    return process.env.NODE_ENV === "production"
      ? { ok: true }
      : { ok: true, devNoAccount: true }
  }

  const result = await sendOtp(parsed.data.email)
  if (result.ok) return { ok: true, devCode: result.devCode }
  return result.reason === "locked"
    ? { ok: false, reason: "locked", retryAfterSeconds: result.retryAfterSeconds }
    : { ok: false, reason: result.reason }
}

/** Password reset step 2: verify the emailed code and set the new password. */
export async function resetPasswordAction(
  rawEmail: string,
  rawCode: string,
  rawPassword: string
): Promise<ActionResult> {
  const parsedEmail = forgotPasswordFormSchema.safeParse({ email: rawEmail })
  const parsedRest = resetPasswordFormSchema.safeParse({
    code: rawCode,
    password: rawPassword,
  })
  if (!parsedEmail.success || !parsedRest.success) {
    return { ok: false, reason: parsedRest.error?.issues[0]?.message ?? "errors.generic" }
  }
  const { email } = parsedEmail.data
  const { code, password } = parsedRest.data

  const user = await getUserByEmail(email)
  if (!user) return { ok: false, reason: "invalid" }

  const verified = await verifyOtp(email, code)
  if (!verified.ok) {
    return verified.reason === "locked"
      ? { ok: false, reason: "locked", retryAfterSeconds: verified.retryAfterSeconds }
      : { ok: false, reason: verified.reason }
  }

  await updateUserPassword(user.id, await bcrypt.hash(password, BCRYPT_COST))

  // Convenient + safe: the code just proved control of the email, so sign
  // the user straight in with the new password.
  try {
    await signIn("credentials", { identifier: email, password, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      console.error("[auth] post-reset signIn failed:", err.type, err.message ?? err.cause)
      // Password was changed; worst case they sign in manually.
      return { ok: true, home: "/login" }
    }
    throw err
  }
  return { ok: true, home: await homeForUser(user.id) }
}

export async function completeOnboardingAction(
  input: z.infer<typeof onboardingFormSchema>
) {
  const parsed = onboardingFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "errors.generic" }
  }
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const { name, username, position, skill, area, coords } = parsed.data
  await db.update(users).set({ name }).where(eq(users.id, user.id))
  try {
    await db
      .update(playerProfiles)
      .set({
        username,
        position: position ?? null,
        skill: skill ?? null,
        area: area ?? null,
        // F7 privacy: round player coords to 3 decimals (~110m) at write time.
        coords: coords ? roundCoords(coords) : null,
        updatedAt: new Date(),
      })
      .where(eq(playerProfiles.userId, user.id))
  } catch (err) {
    // Unique username race (neon-http has no transactions — the index is the
    // authority on availability).
    if ((err as { code?: string }).code === "23505") {
      return { ok: false as const, error: "auth.errors.usernameTaken" }
    }
    throw err
  }
  revalidatePath("/app")
  // A pending turf claim (owner registered straight from the invite link)
  // continues after onboarding instead of the player home; after that, a
  // match invite link visited signed-out routes back to the match.
  const jar = await cookies()
  const claimToken = jar.get(CLAIM_COOKIE)?.value
  if (claimToken && (await resolveClaimToken(claimToken)).ok) {
    return { ok: true as const, home: claimPath(claimToken) }
  }
  const matchPath = jar.get(MATCH_LINK_COOKIE)?.value
  if (isMatchLinkPath(matchPath)) {
    jar.delete(MATCH_LINK_COOKIE)
    return { ok: true as const, home: matchPath }
  }
  return { ok: true as const }
}

/**
 * Player Network: live availability check for the onboarding username field.
 * Format/reserved errors are surfaced first via the shared validators.
 * Keeping your own current username counts as available.
 */
export async function checkUsernameAvailableAction(
  raw: string
): Promise<{ ok: boolean; error?: string }> {
  const { validateUsername, normalizeUsername } = await import(
    "@/features/player/username"
  )
  const check = validateUsername(raw)
  if (!check.ok) return { ok: false, error: check.error }
  const username = normalizeUsername(raw)
  const [row] = await db
    .select({ userId: playerProfiles.userId })
    .from(playerProfiles)
    .where(eq(playerProfiles.username, username))
    .limit(1)
  if (!row) return { ok: true }
  const user = await getCurrentUser()
  if (user && row.userId === user.id) return { ok: true }
  return { ok: false, error: "auth.errors.usernameTaken" }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
}

/**
 * Settings → Security: change password. Verifies the current password, then
 * reuses updateUserPassword — which stamps passwordChangedAt, evicting every
 * OTHER device's session. The current device is re-signed-in with the new
 * password (same pattern as resetPasswordAction), so its fresh token survives
 * the staleness check.
 */
export async function changePasswordAction(
  rawCurrent: string,
  rawNew: string,
  rawConfirm: string
): Promise<ActionResult> {
  const parsed = changePasswordFormSchema.safeParse({
    currentPassword: rawCurrent,
    newPassword: rawNew,
    confirmPassword: rawConfirm,
  })
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "errors.generic" }
  }

  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")

  // 5 attempts / 5 min per account — online guessing against a signed-in
  // session must not be cheaper than login itself.
  const allowed = await rateLimit(`pwd-change:${user.id}`, 5, 300)
  if (!allowed) return { ok: false, reason: "rate_limited" }

  const [row] = await db
    .select({
      passwordHash: users.passwordHash,
      status: users.status,
      phone: users.phone,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (!row || !row.passwordHash || row.status !== "active") {
    return { ok: false, reason: "auth.errors.password_wrong" }
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, row.passwordHash)
  if (!valid) return { ok: false, reason: "auth.errors.password_wrong" }

  await updateUserPassword(user.id, await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST))

  const identifier = row.email ?? row.phone
  try {
    await signIn("credentials", { identifier, password: parsed.data.newPassword, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      console.error("[auth] post-change signIn failed:", err.type, err.message ?? err.cause)
      // Password was changed; worst case they sign in manually.
      return { ok: true }
    }
    throw err
  }
  return { ok: true }
}

/**
 * Settings → Security: phone change step 1 — email an OTP to the verified
 * address authorizing the change (the phone itself can't receive it: the
 * point is to prove the CURRENT owner before the login identifier moves).
 */
export async function startPhoneChangeAction(): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")

  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (!row?.email) return { ok: false, reason: "auth.errors.email_required" }

  const result = await sendOtp(row.email)
  if (result.ok) return { ok: true, devCode: result.devCode }
  return result.reason === "locked"
    ? { ok: false, reason: "locked", retryAfterSeconds: result.retryAfterSeconds }
    : { ok: false, reason: result.reason }
}

/**
 * Phone change step 2: verify the emailed code, then move the login
 * identifier. Check-then-update with the unique index as the authority
 * (same race handling as createRegisteredUser).
 */
export async function verifyPhoneChangeAction(
  rawPhone: string,
  rawCode: string
): Promise<ActionResult> {
  const parsedPhone = changePhoneFormSchema.safeParse({ phone: rawPhone })
  const parsedCode = otpFormSchema.safeParse({ code: rawCode })
  if (!parsedPhone.success) {
    return { ok: false, reason: parsedPhone.error.issues[0]?.message ?? "errors.generic" }
  }
  if (!parsedCode.success) {
    return { ok: false, reason: parsedCode.error.issues[0]?.message ?? "errors.generic" }
  }

  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")

  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (!row?.email) return { ok: false, reason: "auth.errors.email_required" }

  const verified = await verifyOtp(row.email, parsedCode.data.code)
  if (!verified.ok) {
    return verified.reason === "locked"
      ? { ok: false, reason: "locked", retryAfterSeconds: verified.retryAfterSeconds }
      : { ok: false, reason: verified.reason }
  }

  const phone = normalizePhone(parsedPhone.data.phone)
  if (!phone) return { ok: false, reason: "auth.errors.phone_invalid" }
  if (await getUserByPhone(phone)) return { ok: false, reason: "auth.errors.phone_taken" }

  try {
    await db
      .update(users)
      .set({ phone, updatedAt: new Date() })
      .where(eq(users.id, user.id))
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return { ok: false, reason: "auth.errors.phone_taken" }
    }
    throw err
  }
  return { ok: true }
}

/**
 * K3 - request account deletion. Soft-deletes immediately (user can't sign in
 * while status='deleted'), then schedules the hard-anonymize Inngest job to
 * fire after a 14-day grace window. The user can cancel by contacting support
 * (which reinstates `status='active'`); the Inngest job is a no-op if status
 * has been reinstated.
 */
export async function requestAccountDeletionAction() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const now = new Date()
  const anonymizeAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  await db
    .update(users)
    .set({
      status: "deleted",
      deletedAt: now,
      anonymizeAt,
      // Evicts every session on every device: the jwt callback treats tokens
      // issued before this instant as stale (isTokenStale).
      passwordChangedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id))
  const { scheduleAccountAnonymization } = await import("@/lib/inngest")
  await scheduleAccountAnonymization(user.id, anonymizeAt.getTime()).catch(() => {
    // non-fatal: admin can still trigger anonymization manually
  })
  await signOut({ redirectTo: "/login" })
}
