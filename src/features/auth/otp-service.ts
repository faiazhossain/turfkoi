import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { eq, desc } from "drizzle-orm"

import { db } from "@/db"
import { otps } from "@/db/schema"
import { rateLimit } from "@/lib/ratelimit"

import { smsProvider } from "./sms-provider"
import { findOrCreateUserByPhone, getUserByPhone } from "./users"

const CODE_DIGITS = 6
const TTL_MINUTES = 5
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15
const REVALIDATE_SECONDS = 90 // grace window for the Auth.js authorize re-check

export type SendOtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; reason: "invalid_phone" | "rate_limited" }

export type VerifyResult =
  | { ok: true; isNew: boolean }
  | { ok: false; reason: "invalid_phone" | "rate_limited" | "locked" | "expired" | "invalid" }

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

export async function sendOtp(phone: string): Promise<SendOtpResult> {
  if (!phone) return { ok: false, reason: "invalid_phone" }

  const ip = await clientIp()
  const allowPhone = await rateLimit(`otp:send:${phone}`, 1, 60) // 1 / 60s resend (D2)
  const allowIp = await rateLimit(`otp:send-ip:${ip}`, 5, 600) // 5 / 10min / IP
  if (!allowPhone || !allowIp) return { ok: false, reason: "rate_limited" }

  const isProd = process.env.NODE_ENV === "production"
  const code = isProd ? generateCode() : "123456"
  const codeHash = hashCode(code)

  await db.insert(otps).values({
    phone,
    codeHash,
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
  })

  await smsProvider.sendOtp(phone, code)

  return { ok: true, devCode: isProd ? undefined : code }
}

async function latestOtp(phone: string) {
  const rows = await db
    .select()
    .from(otps)
    .where(eq(otps.phone, phone))
    .orderBy(desc(otps.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function verifyOtp(
  phone: string,
  code: string,
  refCode?: string
): Promise<VerifyResult> {
  if (!phone) return { ok: false, reason: "invalid_phone" }

  const ip = await clientIp()
  const allow = await rateLimit(`otp:verify:${phone}`, 10, 60)
  const allowIp = await rateLimit(`otp:verify-ip:${ip}`, 20, 60)
  if (!allow || !allowIp) return { ok: false, reason: "rate_limited" }

  const otp = await latestOtp(phone)
  if (!otp) return { ok: false, reason: "invalid" }
  if (otp.lockedUntil && otp.lockedUntil > new Date())
    return { ok: false, reason: "locked" }
  if (otp.consumedAt) return { ok: false, reason: "invalid" }
  if (otp.expiresAt < new Date()) return { ok: false, reason: "expired" }

  if (otp.codeHash !== hashCode(code)) {
    const attempts = otp.attempts + 1
    const lock = attempts >= MAX_ATTEMPTS // 5 attempts -> lockout (D2)
    await db
      .update(otps)
      .set(
        lock
          ? { attempts, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { attempts }
      )
      .where(eq(otps.id, otp.id))
    return { ok: false, reason: lock ? "locked" : "invalid" }
  }

  // Success: consume + find-or-create user.
  await db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, otp.id))
  const { isNew } = await findOrCreateUserByPhone(phone, refCode)
  return { ok: true, isNew }
}

/**
 * Lenient re-validation for the Auth.js Credentials authorize(). The server
 * action already verified + consumed the OTP; authorize re-checks the code and
 * allows a recently-consumed OTP so it does not double-count attempts.
 */
export async function authorizeSignIn(
  phone: string,
  code: string
): Promise<{ id: string; phone: string; name: string | null } | null> {
  const otp = await latestOtp(phone)
  if (!otp) return null
  if (otp.lockedUntil && otp.lockedUntil > new Date()) return null
  if (otp.codeHash !== hashCode(code)) return null

  const now = new Date()
  const unconsumedValid = !otp.consumedAt && otp.expiresAt > now
  const recentlyConsumed =
    !!otp.consumedAt &&
    now.getTime() - otp.consumedAt.getTime() < REVALIDATE_SECONDS * 1000
  if (!unconsumedValid && !recentlyConsumed) return null

  const user = await getUserByPhone(phone)
  return user ? { id: user.id, phone: user.phone, name: user.name } : null
}
