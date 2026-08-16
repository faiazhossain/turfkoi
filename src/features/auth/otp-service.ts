import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { eq, desc } from "drizzle-orm"

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
  | { ok: false; reason: "invalid_email" | "rate_limited" }

export type VerifyResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | "invalid_email"
        | "rate_limited"
        | "locked"
        | "expired"
        | "consumed"
        | "invalid"
    }

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

  const isProd = process.env.NODE_ENV === "production"
  const code = isProd ? generateCode() : "123456"
  const codeHash = hashCode(code)

  await db.insert(otps).values({
    email,
    codeHash,
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
  })

  await emailProvider.sendOtp(email, code)

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
  if (otp.lockedUntil && otp.lockedUntil > new Date())
    return { ok: false, reason: "locked" }
  // A consumed code is not "wrong" — telling the user so sends them into a
  // retry loop that can never succeed. They need a fresh code instead.
  if (otp.consumedAt) return { ok: false, reason: "consumed" }
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

  // Success: consume the code. Callers decide what happens next (create the
  // account, or set a new password).
  await db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, otp.id))
  return { ok: true }
}
