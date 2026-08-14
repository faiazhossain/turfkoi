"use server"

import { revalidatePath } from "next/cache"
import { AuthError } from "next-auth"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { signIn, signOut } from "@/auth"
import { db } from "@/db"
import { users, playerProfiles } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { cookies } from "next/headers"

import { normalizePhone, isValidPhone } from "./phone"
import { sendOtp, verifyOtp } from "./otp-service"
import { onboardingFormSchema } from "./schemas"

type ActionResult =
  | { ok: true; devCode?: string; isNew?: boolean }
  | { ok: false; reason: string }

export async function sendOtpAction(rawPhone: string): Promise<ActionResult> {
  const phone = normalizePhone(rawPhone)
  if (!isValidPhone(phone)) return { ok: false, reason: "invalid_phone" }
  const result = await sendOtp(phone)
  return result.ok
    ? { ok: true, devCode: result.devCode }
    : { ok: false, reason: result.reason }
}

export async function verifyOtpAction(
  rawPhone: string,
  code: string
): Promise<ActionResult> {
  const phone = normalizePhone(rawPhone)
  if (!isValidPhone(phone)) return { ok: false, reason: "invalid_phone" }
  // A3: pull the referral code from the cookie (set by /invite/[code]).
  const refCode = (await cookies()).get("turfkoi_ref")?.value || undefined
  const result = await verifyOtp(phone, code.trim(), refCode)
  if (!result.ok) return { ok: false, reason: result.reason }
  try {
    await signIn("phone-otp", { phone, code: code.trim(), redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      // Only a CredentialsSignin rejection means the credentials were checked
      // and rejected. Any other AuthError (UntrustedHost, MissingSecret,
      // CallbackRouteError, ...) is a config/runtime fault — surface it in the
      // logs instead of masking it as a wrong code, which traps the user in a
      // retry loop against an already-consumed OTP.
      if (err.type === "CredentialsSignin") return { ok: false, reason: "invalid" }
      console.error("[auth] signIn failed:", err.type, err.message ?? err.cause)
      return { ok: false, reason: "signin_failed" }
    }
    throw err
  }
  return { ok: true, isNew: result.isNew }
}

export async function completeOnboardingAction(
  input: z.infer<typeof onboardingFormSchema>
) {
  const parsed = onboardingFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const { name, position, skill, area } = parsed.data
  await db.update(users).set({ name }).where(eq(users.id, user.id))
  await db
    .update(playerProfiles)
    .set({ position: position ?? null, skill: skill ?? null, area: area ?? null })
    .where(eq(playerProfiles.userId, user.id))
  revalidatePath("/app")
  return { ok: true as const }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
}

/**
 * K3 — request account deletion. Soft-deletes immediately (user can't sign in
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
