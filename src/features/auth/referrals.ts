import "server-only"
import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { referralCodes, referrals } from "@/db/schema"

// Unambiguous alphabet (no 0/O/1/I/L confusion) — friendlier for WhatsApp shares.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LEN = 6

function mintCode(): string {
  const bytes = randomBytes(CODE_LEN)
  let out = ""
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

/** Return the user's referral code, minting one on first call (idempotent). */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1)
  if (existing[0]) return existing[0].code

  // Mint + insert. Retry on the (extremely unlikely) PK collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = mintCode()
    try {
      await db.insert(referralCodes).values({ code, userId })
      return code
    } catch {
      // collision — loop
    }
  }
  // Fallback: derive from userId so we always return *something*.
  const fallback = "P" + userId.replace(/-/g, "").slice(0, 5).toUpperCase()
  await db
    .insert(referralCodes)
    .values({ code: fallback, userId })
    .onConflictDoNothing()
  return fallback
}

/**
 * Attribute a new signup to a referrer. Idempotent: the unique constraint on
 * `referred_user_id` makes a double-attribution a no-op. Also guarded by a
 * self-referral check (you can't refer yourself).
 */
export async function attributeReferral(
  referrerCode: string,
  referredUserId: string
): Promise<void> {
  const [referrer] = await db
    .select({ userId: referralCodes.userId })
    .from(referralCodes)
    .where(eq(referralCodes.code, referrerCode))
    .limit(1)
  if (!referrer) return
  if (referrer.userId === referredUserId) return

  await db
    .insert(referrals)
    .values({
      referrerUserId: referrer.userId,
      referredUserId,
      code: referrerCode,
    })
    .onConflictDoNothing()
}

/** Resolve a code → referrer userId (for the invite landing page). */
export async function isValidReferralCode(code: string): Promise<boolean> {
  const rows = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(and(eq(referralCodes.code, code)))
    .limit(1)
  return !!rows[0]
}
