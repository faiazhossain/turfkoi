"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import type { z } from "zod"
import { AuthError } from "next-auth"

import { signIn } from "@/auth"
import { db } from "@/db"
import { turfs, users } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit } from "@/lib/ratelimit"
import { logger } from "@/lib/logger"
import { getUserByPhone } from "@/features/auth/users"
import { isValidPhone } from "@/features/auth/phone"
import { findOrCreateOwnerByPhone } from "@/features/turf-claims/owner-account"

import { mintOwnerLoginCode, verifyOwnerLoginCode } from "./codes"
import {
  mintOwnerLoginCodeSchema,
  ownerCodeLoginSchema,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

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
 * Admin mints a one-time WhatsApp sign-in code for an owned turf's owner
 * (support tool: forgot password, lockout, suspected compromise). The
 * plaintext code is returned once for the admin to relay — only its hash
 * is stored. With lockPassword, the owner's stored password is cleared so
 * only the code path works until they set a new one.
 */
export async function mintOwnerLoginCodeAction(
  input: z.infer<typeof mintOwnerLoginCodeSchema>
): Promise<
  | {
      ok: true
      code: string
      phone: string
      expiresAt: Date
      turfName: string
      passwordLocked: boolean
    }
  | { ok: false; error: string }
> {
  const parsed = mintOwnerLoginCodeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const actor = await adminActor()
  if (!actor.ok) return actor

  const rows = await db
    .select({
      turfName: turfs.name,
      ownerId: turfs.ownerId,
      ownerPhone: users.phone,
    })
    .from(turfs)
    // Seeded turfs have no owner — left join keeps them reachable so the
    // unowned branch below can give its own message.
    .leftJoin(users, eq(users.id, turfs.ownerId))
    .where(eq(turfs.id, parsed.data.turfId))
    .limit(1)
  const turf = rows[0]
  if (!turf) return { ok: false, error: "Turf not found." }
  if (!turf.ownerId || !turf.ownerPhone) {
    return {
      ok: false,
      error: "This turf has no owner yet — send a claim invite instead.",
    }
  }

  if (parsed.data.lockPassword) {
    await db
      .update(users)
      .set({ passwordHash: null, updatedAt: new Date() })
      .where(eq(users.id, turf.ownerId))
  }

  const { code, expiresAt } = await mintOwnerLoginCode(
    actor.id,
    turf.ownerPhone
  )

  logger.info("admin.owner_login_code_minted", {
    turfId: parsed.data.turfId,
    lockPassword: parsed.data.lockPassword,
  })
  revalidatePath(`/admin/turfs/${parsed.data.turfId}`)

  return {
    ok: true,
    code,
    phone: turf.ownerPhone,
    expiresAt,
    turfName: turf.turfName,
    passwordLocked: parsed.data.lockPassword,
  }
}

/**
 * Owner signs in with phone + the 6-digit code the admin relayed over
 * WhatsApp. On success the account's password is rotated to a one-time
 * value used only inside this request (the same hardened-credentials
 * mechanism as the claim OTP flow) — the client then forces the
 * set-password step.
 */
export async function ownerCodeLoginAction(
  input: z.infer<typeof ownerCodeLoginSchema>
): Promise<ActionResult> {
  const parsed = ownerCodeLoginSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  if (!isValidPhone(parsed.data.phone)) {
    return {
      ok: false,
      error: "Enter a valid Bangladeshi number, e.g. 01XXXXXXXXX",
    }
  }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const allowIp = await rateLimit(`owner-code:ip:${ip}`, 10, 300)
  if (!allowIp) {
    return { ok: false, error: "Too many attempts. Try again later." }
  }

  const verified = await verifyOwnerLoginCode(
    parsed.data.phone,
    parsed.data.code
  )
  if (!verified.ok) {
    const messages: Record<typeof verified.reason, string> = {
      no_code:
        "No active code for this number. Ask the Turfkoi team for a new one.",
      invalid:
        verified.attemptsLeft !== undefined
          ? `Wrong code. ${verified.attemptsLeft} attempt${verified.attemptsLeft === 1 ? "" : "s"} left.`
          : "Wrong code. Try again.",
      locked: "Too many wrong codes. Try again in 15 minutes.",
      consumed: "This code was already used. Ask for a new one.",
      expired: "This code expired. Ask the Turfkoi team for a new one.",
      revoked: "This code was replaced by a newer one. Ask for the latest.",
    }
    return { ok: false, error: messages[verified.reason] }
  }

  const allowPhone = await rateLimit(
    `owner-code:phone:${verified.phone}`,
    10,
    300
  )
  if (!allowPhone) {
    return { ok: false, error: "Too many attempts. Try again later." }
  }

  const existing = await getUserByPhone(verified.phone)
  if (!existing || existing.status === "deleted") {
    return { ok: false, error: "No account found for this number." }
  }

  // Rotate to a one-time password and sign in with it in the same request;
  // the account was confirmed to exist, so the create path never runs.
  const owner = await findOrCreateOwnerByPhone({ phone: verified.phone })

  try {
    await signIn("credentials", {
      identifier: owner.phone,
      password: owner.oneTimePassword,
      redirect: false,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      console.error("[owner-login] code sign-in failed:", err)
      return { ok: false, error: "Couldn't sign you in. Try again." }
    }
    throw err
  }

  return { ok: true }
}
