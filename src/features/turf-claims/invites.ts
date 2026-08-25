import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { turfClaimInvites, turfs } from "@/db/schema"
import { normalizePhone } from "@/features/auth/phone"

// Edge-safe constants live in ./constants so the middleware can import them
// without dragging this server-only module into the edge bundle.
import { CLAIM_INVITE_TTL_DAYS } from "./constants"
export { CLAIM_COOKIE, CLAIM_INVITE_TTL_DAYS } from "./constants"

export type ClaimTokenResolution =
  | {
      ok: true
      inviteId: string
      turfId: string
      expiresAt: Date
      targetPhone: string | null
    }
  | {
      ok: false
      reason: "invalid" | "expired" | "claimed" | "revoked" | "turf_claimed"
    }

export type ClaimOtpResult =
  | { ok: true; inviteId: string; turfId: string; phone: string }
  | {
      ok: false
      reason:
        | "invalid"
        | "expired"
        | "claimed"
        | "revoked"
        | "turf_claimed"
        | "no_otp"
        | "locked"
        | "consumed"
        | "rate_limited"
      attemptsLeft?: number
    }

const OTP_MAX_ATTEMPTS = 5
const OTP_LOCK_MINUTES = 15

function mintToken(): string {
  // A claim grants ownership — unlike referral codes, this needs real
  // entropy: 32 bytes, base64url (43 chars).
  return randomBytes(32).toString("base64url")
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function mintOtp(): string {
  // Dev parity with the email OTP service — a fixed code keeps manual
  // testing of the claim flow painless; hashed + attempt-limited like prod.
  if (process.env.NODE_ENV !== "production") return "123456"
  let code = ""
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10)
  return code
}

export function claimPath(token: string): string {
  return `/claim/${token}`
}

/**
 * Create (or replace) the invite for an unclaimed turf. Any previous active
 * invite is revoked first so old links die immediately; rows are kept for
 * audit. The plaintext token (and OTP, when a phone is given) is returned
 * once — only hashes are stored.
 */
export async function createClaimInvite(
  adminId: string,
  turfId: string,
  targetEmail?: string,
  targetPhone?: string
): Promise<{ token: string; otp: string | null; expiresAt: Date }> {
  await db
    .update(turfClaimInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(turfClaimInvites.turfId, turfId),
        isNull(turfClaimInvites.claimedAt),
        isNull(turfClaimInvites.revokedAt)
      )
    )

  const token = mintToken()
  const phone = targetPhone ? normalizePhone(targetPhone) : null
  const otp = phone ? mintOtp() : null
  const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_DAYS * 24 * 60 * 60_000)
  await db.insert(turfClaimInvites).values({
    turfId,
    tokenHash: hashToken(token),
    targetEmail: targetEmail ?? null,
    targetPhone: phone,
    otpHash: otp ? hashToken(otp) : null,
    invitedBy: adminId,
    expiresAt,
  })
  return { token, otp, expiresAt }
}

/**
 * Resolve a claim token to its invite, checking every terminal state.
 * `turf_claimed` covers the case where the turf got an owner through some
 * other path while a fresh invite was still outstanding.
 */
export async function resolveClaimToken(
  token: string
): Promise<ClaimTokenResolution> {
  if (!token || token.length < 20 || token.length > 100) {
    return { ok: false, reason: "invalid" }
  }

  const rows = await db
    .select({
      id: turfClaimInvites.id,
      turfId: turfClaimInvites.turfId,
      expiresAt: turfClaimInvites.expiresAt,
      claimedAt: turfClaimInvites.claimedAt,
      revokedAt: turfClaimInvites.revokedAt,
      targetPhone: turfClaimInvites.targetPhone,
      turfOwnerId: turfs.ownerId,
    })
    .from(turfClaimInvites)
    .innerJoin(turfs, eq(turfs.id, turfClaimInvites.turfId))
    .where(eq(turfClaimInvites.tokenHash, hashToken(token)))
    .limit(1)

  const invite = rows[0]
  if (!invite) return { ok: false, reason: "invalid" }
  if (invite.claimedAt) return { ok: false, reason: "claimed" }
  if (invite.revokedAt) return { ok: false, reason: "revoked" }
  if (invite.expiresAt < new Date()) return { ok: false, reason: "expired" }
  if (invite.turfOwnerId !== null) return { ok: false, reason: "turf_claimed" }

  return {
    ok: true,
    inviteId: invite.id,
    turfId: invite.turfId,
    expiresAt: invite.expiresAt,
    targetPhone: invite.targetPhone,
  }
}

/**
 * Verify the 6-digit OTP attached to a claim invite. Rules mirror the email
 * OTP service: sha256 compare, attempts increment on mismatch, 15-minute
 * lock at 5 misses, single use. The OTP shares the invite's expiry — no
 * separate deadline to explain to a low-tech owner.
 */
export async function verifyClaimOtp(
  token: string,
  code: string
): Promise<ClaimOtpResult> {
  const resolved = await resolveClaimToken(token)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }

  const rows = await db
    .select({
      id: turfClaimInvites.id,
      targetPhone: turfClaimInvites.targetPhone,
      otpHash: turfClaimInvites.otpHash,
      otpAttempts: turfClaimInvites.otpAttempts,
      otpLockedUntil: turfClaimInvites.otpLockedUntil,
      otpConsumedAt: turfClaimInvites.otpConsumedAt,
    })
    .from(turfClaimInvites)
    .where(eq(turfClaimInvites.id, resolved.inviteId))
    .limit(1)

  const invite = rows[0]
  if (!invite?.targetPhone || !invite.otpHash) {
    return { ok: false, reason: "no_otp" }
  }
  if (invite.otpLockedUntil && invite.otpLockedUntil > new Date()) {
    return { ok: false, reason: "locked" }
  }
  // A consumed code can't retry into success — the owner needs a fresh
  // invite (or the admin re-sends the same link flow).
  if (invite.otpConsumedAt) return { ok: false, reason: "consumed" }

  if (invite.otpHash !== hashToken(code)) {
    const attempts = invite.otpAttempts + 1
    const lock = attempts >= OTP_MAX_ATTEMPTS
    await db
      .update(turfClaimInvites)
      .set(
        lock
          ? {
              otpAttempts: attempts,
              otpLockedUntil: new Date(Date.now() + OTP_LOCK_MINUTES * 60_000),
            }
          : { otpAttempts: attempts }
      )
      .where(eq(turfClaimInvites.id, invite.id))
    return {
      ok: false,
      reason: lock ? "locked" : "invalid",
      attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
    }
  }

  // Consume conditionally so a concurrent double-submit can't burn the
  // winner's success path.
  const consumed = await db
    .update(turfClaimInvites)
    .set({ otpConsumedAt: new Date() })
    .where(
      and(
        eq(turfClaimInvites.id, invite.id),
        isNull(turfClaimInvites.otpConsumedAt)
      )
    )
    .returning({ id: turfClaimInvites.id })
  if (consumed.length === 0) {
    return { ok: false, reason: "consumed" }
  }

  return {
    ok: true,
    inviteId: invite.id,
    turfId: resolved.turfId,
    phone: invite.targetPhone,
  }
}
