/**
 * Pure player-identity helpers (Player Network) — no DB imports so client
 * forms/schemas can use them. DB write logic lives in identity.ts.
 */

// 31 unambiguous chars — no 0/O/1/I/L so codes read cleanly aloud/typed.
export const PLAYER_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
export const PLAYER_ID_LENGTH = 6
const PLAYER_ID_RE = new RegExp(
  `^DT-[${PLAYER_ID_ALPHABET}]{${PLAYER_ID_LENGTH}}$`
)

export function generatePlayerId(rand: () => number = Math.random): string {
  let code = ""
  for (let i = 0; i < PLAYER_ID_LENGTH; i++) {
    code += PLAYER_ID_ALPHABET[Math.floor(rand() * PLAYER_ID_ALPHABET.length)]
  }
  return `DT-${code}`
}

export function isPlayerIdFormat(value: string): boolean {
  return PLAYER_ID_RE.test(value)
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "")
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

// Handles that would impersonate the platform or confuse support.
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "deshiturf",
  "support",
  "help",
  "moderator",
  "mod",
  "system",
  "root",
  "null",
  "undefined",
  "official",
  "team",
  "player",
])

export type UsernameCheck =
  | { ok: true; value: string }
  | {
      ok: false
      error: "auth.errors.usernameInvalid" | "auth.errors.usernameReserved"
    }

/** Validate + normalize a username. Errors are dictionary keys. */
export function validateUsername(raw: string): UsernameCheck {
  const value = normalizeUsername(raw)
  if (!USERNAME_RE.test(value)) return { ok: false, error: "auth.errors.usernameInvalid" }
  if (RESERVED_USERNAMES.has(value)) return { ok: false, error: "auth.errors.usernameReserved" }
  return { ok: true, value }
}

/**
 * Suggest a username from a display name: latin letters from the name plus a
 * numeric suffix. Bangla-only names fall back to "player". The suggestion is
 * a starting point — availability is enforced server-side by the unique index.
 */
export function suggestUsername(
  name: string | null,
  rand: () => number = Math.random
): string {
  const base =
    (name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12) || "player"
  const suffix = String(Math.floor(rand() * 9000) + 1000)
  return `${base}${suffix}`.slice(0, 20)
}
