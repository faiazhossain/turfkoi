/**
 * Edge-safe match-link constants and helpers. Imported by the proxy bundle
 * (which cannot pull in server-only modules) and by the match/auth features.
 */

/**
 * Cookie that carries a match invite path across login/register/onboarding —
 * the same pattern as the turf-claim cookie (CLAIM_COOKIE). Set by the proxy
 * when a signed-out visitor opens /m/<token> or /matches/<id>, so after auth
 * they land straight back on the match instead of their role home.
 */
export const MATCH_LINK_COOKIE = "tk_match_link"

/** 1 hour — a shared link is acted on immediately or not at all. */
export const MATCH_LINK_TTL_SECONDS = 60 * 60

/**
 * Paths eligible for the post-auth redirect. Only server-set match paths
 * qualify: single leading slash, no protocol-relative or encoded tricks.
 */
export function isMatchLinkPath(path: string | undefined | null): path is string {
  if (!path) return false
  if (path.length === 0 || path.length > 200) return false
  if (!path.startsWith("/")) return false
  if (path.startsWith("//") || path.includes("\\")) return false
  return path.startsWith("/matches/") || path.startsWith("/m/")
}

/**
 * Public share token for the invite link (/m/<token>). 8 lowercase hex chars
 * (128 bits of uuid v4) — enough entropy for a non-secret convenience token,
 * and short enough to type or read out. Uniqueness is enforced by the
 * matches_share_token_idx unique index.
 */
export function mintShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
}

/** The canonical shareable path for a token. */
export function matchSharePath(token: string): string {
  return `/m/${token}`
}

/** Mask a phone for public-ish display: keep prefix + last 2 digits. */
export function maskPhone(phone: string): string {
  return phone.length <= 4 ? phone : `${phone.slice(0, 4)}**${phone.slice(-2)}`
}
