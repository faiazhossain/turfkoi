import "server-only"

import { createHash, randomInt } from "node:crypto"
import { and, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { ownerLoginCodes } from "@/db/schema"
import { normalizePhone } from "@/features/auth/phone"

const CODE_TTL_MINUTES = 15
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export type OwnerLoginCodeResult =
  | { ok: true; phone: string }
  | {
      ok: false
      reason:
        | "invalid"
        | "expired"
        | "locked"
        | "consumed"
        | "revoked"
        | "no_code"
      attemptsLeft?: number
    }

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

function mintCode(): string {
  // Dev parity with the claim OTP service — a fixed code keeps manual
  // testing painless; hashed + attempt-limited like prod.
  if (process.env.NODE_ENV !== "production") return "123456"
  let code = ""
  for (let i = 0; i < 6; i++) code += randomInt(10)
  return code
}

/**
 * Mint a one-time sign-in code for an owner's phone. Any previous active
 * code for the phone is revoked first — the partial unique index keeps at
 * most one — while rows are kept after revoke for audit. The plaintext
 * code is returned once; only its sha256 hash is stored.
 */
export async function mintOwnerLoginCode(
  adminId: string,
  phone: string
): Promise<{ code: string; expiresAt: Date }> {
  const normalized = normalizePhone(phone)

  await db
    .update(ownerLoginCodes)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(ownerLoginCodes.phone, normalized),
        isNull(ownerLoginCodes.consumedAt),
        isNull(ownerLoginCodes.revokedAt)
      )
    )

  const code = mintCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
  await db.insert(ownerLoginCodes).values({
    phone: normalized,
    codeHash: hashCode(code),
    createdBy: adminId,
    expiresAt,
  })
  return { code, expiresAt }
}

/**
 * Verify a 6-digit sign-in code for a phone. Rules mirror the claim OTP
 * service (features/turf-claims/invites.ts): sha256 compare, attempts
 * increment on mismatch, 15-minute lock at 5 misses, single use via
 * conditional consume. The newest row for the phone is the active one —
 * revoked/consumed older rows are audit history only.
 */
export async function verifyOwnerLoginCode(
  phone: string,
  code: string
): Promise<OwnerLoginCodeResult> {
  const normalized = normalizePhone(phone)

  const rows = await db
    .select()
    .from(ownerLoginCodes)
    .where(eq(ownerLoginCodes.phone, normalized))
    .orderBy(desc(ownerLoginCodes.createdAt))
    .limit(1)
  const row = rows[0]
  if (!row) return { ok: false, reason: "no_code" }

  if (row.consumedAt) return { ok: false, reason: "consumed" }
  if (row.revokedAt) return { ok: false, reason: "revoked" }
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" }
  if (row.lockedUntil && row.lockedUntil > new Date()) {
    return { ok: false, reason: "locked" }
  }

  if (row.codeHash !== hashCode(code)) {
    const attempts = row.attempts + 1
    const lock = attempts >= MAX_ATTEMPTS
    await db
      .update(ownerLoginCodes)
      .set(
        lock
          ? {
              attempts,
              lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
            }
          : { attempts }
      )
      .where(eq(ownerLoginCodes.id, row.id))
    return {
      ok: false,
      reason: lock ? "locked" : "invalid",
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
    }
  }

  // Consume conditionally so a concurrent double-submit can't burn the
  // winner's success path.
  const consumed = await db
    .update(ownerLoginCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(ownerLoginCodes.id, row.id), isNull(ownerLoginCodes.consumedAt))
    )
    .returning({ id: ownerLoginCodes.id })
  if (consumed.length === 0) {
    return { ok: false, reason: "consumed" }
  }

  return { ok: true, phone: normalized }
}
