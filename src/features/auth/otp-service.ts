import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { and, desc, eq, gt, isNotNull } from "drizzle-orm"

import { db } from "@/db"
import { otps } from "@/db/schema"
import { rateLimit } from "@/lib/ratelimit"

import { emailProvider } from "./email-provider"

const CODE_DIGITS = 6
const TTL_MINUTES = 5
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export type SendOtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; reason: "invalid_email" | "rate_limited" | "send_failed" }
  | { ok: false; reason: "locked"; retryAfterSeconds: number }

export type VerifyResult =
  | { ok: true }
  | {
      ok: false
      reason: "invalid_email" | "rate_limited" | "expired" | "consumed" | "invalid"
    }
  | { ok: false; reason: "locked"; retryAfterSeconds: number }

function generateCode(): string {
  // Short-lived, rate-limited, hashed; Math.random is sufficient here.
  let code = ""
  for (let i = 0; i < CODE_DIGITS; i++) code += Math.floor(Math.random() * 10)
  return code
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

/**
 * The lockout is enforced per EMAIL, not per OTP row: any row for the
 * address with a live lockedUntil locks the whole address. Without this,
 * restarting the flow (which inserts a fresh attempts=0 row) would reset
 * the attempt counter and let the 15-minute restriction be bypassed.
 */
async function activeLock(email: string): Promise<Date | null> {
  const rows = await db
    .select({ lockedUntil: otps.lockedUntil })
    .from(otps)
    .where(
      and(
        eq(otps.email, email),
        isNotNull(otps.lockedUntil),
        gt(otps.lockedUntil, new Date())
      )
    )
    .orderBy(desc(otps.lockedUntil))
    .limit(1)
  return rows[0]?.lockedUntil ?? null
}

/**
 * Email OTP - used to verify the address at registration and to authorize
 * password resets. Login itself is password-based, so volume stays inside the
 * email provider's free tier.
 */
export async function sendOtp(email: string): Promise<SendOtpResult> {
  if (!email) return { ok: false, reason: "invalid_email" }

  const ip = await clientIp()
  const allowEmail = await rateLimit(`otp:send:${email}`, 1, 60) // 1 / 60s resend (D2)
  const allowIp = await rateLimit(`otp:send-ip:${ip}`, 5, 600) // 5 / 10min / IP
  if (!allowEmail || !allowIp) return { ok: false, reason: "rate_limited" }

  // A locked address gets no fresh code (and no fresh attempt counter) until
  // the lock expires.
  const lockedUntil = await activeLock(email)
  if (lockedUntil) {
    return {
      ok: false,
      reason: "locked",
      retryAfterSeconds: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
    }
  }

  const isProd = process.env.NODE_ENV === "production"
  const code = isProd ? generateCode() : "123456"
  const codeHash = hashCode(code)

  const [inserted] = await db
    .insert(otps)
    .values({
      email,
      codeHash,
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
    })
    .returning({ id: otps.id })

  try {
    await emailProvider.sendOtp(email, code)
  } catch (err) {
    // A code the user never received must not sit as the latest OTP for the
    // address, and the failure must surface instead of throwing unhandled.
    console.error("[otp] email send failed:", err)
    await db.delete(otps).where(eq(otps.id, inserted.id))
    return { ok: false, reason: "send_failed" }
  }

  return { ok: true, devCode: isProd ? undefined : code }
}

async function latestOtp(email: string) {
  const rows = await db
    .select()
    .from(otps)
    .where(eq(otps.email, email))
    .orderBy(desc(otps.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function verifyOtp(
  email: string,
  code: string
): Promise<VerifyResult> {
  if (!email) return { ok: false, reason: "invalid_email" }

  const ip = await clientIp()
  const allow = await rateLimit(`otp:verify:${email}`, 10, 60)
  const allowIp = await rateLimit(`otp:verify-ip:${ip}`, 20, 60)
  if (!allow || !allowIp) return { ok: false, reason: "rate_limited" }

  const otp = await latestOtp(email)
  if (!otp) return { ok: false, reason: "invalid" }
  // Lock state lives on the address, not the latest row (activeLock) —
  // a fresh row inserted by a re-sent code must not lift the lock.
  const lockedUntil = await activeLock(email)
  if (lockedUntil) {
    return {
      ok: false,
      reason: "locked",
      retryAfterSeconds: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
    }
  }
  // A consumed code is not "wrong" — telling the user so sends them into a
  // retry loop that can never succeed. They need a fresh code instead.
  if (otp.consumedAt) return { ok: false, reason: "consumed" }
  if (otp.expiresAt < new Date()) return { ok: false, reason: "expired" }

  if (otp.codeHash !== hashCode(code)) {
    const attempts = otp.attempts + 1
    const lock = attempts >= MAX_ATTEMPTS // 5 attempts -> lockout (D2)
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000)
    await db
      .update(otps)
      .set(
        lock
          ? { attempts, lockedUntil }
          : { attempts }
      )
      .where(eq(otps.id, otp.id))
    if (lock) {
      return {
        ok: false,
        reason: "locked",
        retryAfterSeconds: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
      }
    }
    return { ok: false, reason: "invalid" }
  }

  // Success: consume the code. Callers decide what happens next (create the
  // account, or set a new password).
  await db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, otp.id))
  return { ok: true }
}
