import { normalizePhone, isValidPhone } from "./phone"

export type Identifier =
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string }

// Minimal shape check; the authoritative uniqueness check is the DB lookup.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A login identifier is an email address or a BD phone number, in one input.
 * Emails are lowercased on the way through - Postgres unique indexes are
 * case-sensitive, so Foo@x.com and foo@x.com must never become two accounts.
 */
export function resolveIdentifier(input: string): Identifier | null {
  const raw = input.trim()
  if (!raw) return null
  if (raw.includes("@")) {
    const email = raw.toLowerCase()
    return EMAIL_SHAPE.test(email) ? { kind: "email", email } : null
  }
  const phone = normalizePhone(raw)
  return isValidPhone(phone) ? { kind: "phone", phone } : null
}
