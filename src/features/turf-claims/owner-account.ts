import "server-only"

import { randomInt } from "node:crypto"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { users, userRoles, playerProfiles } from "@/db/schema"
import { getUserByEmail, getUserByPhone } from "@/features/auth/users"
import { normalizePhone } from "@/features/auth/phone"

const BCRYPT_COST = 10

// Small, unambiguous alphabet — readable over WhatsApp, no 0/O or 1/l traps.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz"

/** Random simple password, e.g. "kex-mol-far" — for the claim-flow skip path. */
export function generateSimplePassword(): string {
  const chunk = () =>
    Array.from(
      { length: 3 },
      () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
    ).join("")
  return `${chunk()}-${chunk()}-${chunk()}`
}

export type OwnerAccount = {
  userId: string
  phone: string
  /**
   * One-time password backing the session. Returned in memory only — the
   * owner replaces it in the set/skip password step; it never persists in
   * plaintext anywhere.
   */
  oneTimePassword: string
}

/**
 * Find or create the owner account for a verified claim OTP. The link + OTP
 * jointly proved control of this phone, so:
 *  - existing account → its password is rotated to a fresh random one
 *    (recovery: the owner sets a new one in the modal right after);
 *  - no account → one is created with the phone (and email when free).
 *
 * The plaintext one-time password is returned once for the signIn call in
 * the same request; only its bcrypt hash is stored.
 */
export async function findOrCreateOwnerByPhone(input: {
  phone: string
  email?: string | null
  name?: string | null
}): Promise<OwnerAccount> {
  const phone = normalizePhone(input.phone)
  const oneTimePassword = generateSimplePassword()
  const passwordHash = await bcrypt.hash(oneTimePassword, BCRYPT_COST)

  const existing = await getUserByPhone(phone)
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, existing.id))
    return { userId: existing.id, phone, oneTimePassword }
  }

  // Email is only attached when it's free — a conflicting email belongs to
  // a different account and must not leak into this one.
  let email: string | null = null
  if (input.email) {
    const emailTaken = await getUserByEmail(input.email)
    if (!emailTaken) email = input.email
  }

  try {
    const [created] = await db
      .insert(users)
      .values({
        name: input.name ?? "Turf Owner",
        phone,
        email,
        passwordHash,
      })
      .returning({ id: users.id })

    // Same baseline every other creation path grants (idempotent).
    await db.insert(playerProfiles).values({ userId: created.id }).onConflictDoNothing()
    await db
      .insert(userRoles)
      .values({ userId: created.id, role: "player" })
      .onConflictDoNothing()

    return { userId: created.id, phone, oneTimePassword }
  } catch (err) {
    // Unique race on phone: treat it as the existing-account path.
    const again = await getUserByPhone(phone)
    if (again) {
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, again.id))
      return { userId: again.id, phone, oneTimePassword }
    }
    throw err
  }
}
