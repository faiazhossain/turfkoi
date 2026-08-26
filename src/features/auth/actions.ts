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
import { sendOtp, verifyOtp } from "./otp-service"
import {
  CLAIM_COOKIE,
  claimPath,
  resolveClaimToken,
} from "@/features/turf-claims/invites"
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
} from "./schemas"

const BCRYPT_COST = 10

type ActionResult =
  | { ok: true; devCode?: string; isNew?: boolean; home?: string }
  | { ok: false; reason: string }

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

/** Post-login routing by strongest role: admins land on the admin console,
 * turf owners on their dashboard - the player dashboard is player work.
 * A pending turf-claim invite (cookie set by /claim/[token] when visited
 * signed-out) takes precedence over the role home. */
async function homeForUser(userId: string): Promise<string> {
  const claimToken = (await cookies()).get(CLAIM_COOKIE)?.value
  if (claimToken) {
    const resolved = await resolveClaimToken(claimToken)
    if (resolved.ok) return claimPath(claimToken)
  }
  const roles = await getUserRoles(userId)
  return roles.includes("admin")
    ? "/admin"
    : roles.includes("turf_owner")
      ? "/turf-owner"
      : "/app"
}

/**
 * Step 1 of registration: validate the details, make sure phone + email are
 * free, and send a verification code to the email. The account is only
 * created once the code is verified (verifyRegistrationAction).
 */
export async function startRegistrationAction(
  input: z.input<typeof registrationFormSchema>
): Promise<ActionResult> {
  const parsed = registrationFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "errors.generic" }
  }
  const { phone, email } = parsed.data
  const normalizedPhone = normalizePhone(phone)

  if (await getUserByPhone(normalizedPhone)) {
    return { ok: false, reason: "phone_taken" }
  }
  if (await getUserByEmail(email)) return { ok: false, reason: "email_taken" }

  const result = await sendOtp(email)
  return result.ok
    ? { ok: true, devCode: result.devCode }
    : { ok: false, reason: result.reason }
}

/**
 * Step 2 of registration: verify the emailed code, create the account, and
 * sign the user in. The client re-posts the details from step 1 so no
 * plaintext password is ever parked in a cookie or the DB unhashed.
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
  if (!verified.ok) return { ok: false, reason: verified.reason }

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
  if (!user) return { ok: true }

  const result = await sendOtp(parsed.data.email)
  return result.ok
    ? { ok: true, devCode: result.devCode }
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
  if (!verified.ok) return { ok: false, reason: verified.reason }

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
  const { name, position, skill, area, coords } = parsed.data
  await db.update(users).set({ name }).where(eq(users.id, user.id))
  await db
    .update(playerProfiles)
    .set({
      position: position ?? null,
      skill: skill ?? null,
      area: area ?? null,
      // F7 privacy: round player coords to 3 decimals (~110m) at write time.
      coords: coords ? roundCoords(coords) : null,
      updatedAt: new Date(),
    })
    .where(eq(playerProfiles.userId, user.id))
  revalidatePath("/app")
  // A pending turf claim (owner registered straight from the invite link)
  // continues after onboarding instead of the player home.
  const claimToken = (await cookies()).get(CLAIM_COOKIE)?.value
  if (claimToken && (await resolveClaimToken(claimToken)).ok) {
    return { ok: true as const, home: claimPath(claimToken) }
  }
  return { ok: true as const }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
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
  await db
    .update(users)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(users.id, user.id))
  const { scheduleAccountAnonymization } = await import("@/lib/inngest")
  await scheduleAccountAnonymization(user.id).catch(() => {
    // non-fatal: admin can still trigger anonymization manually
  })
  await signOut({ redirectTo: "/login" })
}
