/**
 * Edge-safe turf-claim constants. Imported by both the middleware bundle
 * (which cannot pull in server-only modules) and src/features/turf-claims.
 */

/** 14 days — enough for a low-tech owner to get around to the link. */
export const CLAIM_INVITE_TTL_DAYS = 14

/** Cookie that carries a pending claim token across login/register. */
export const CLAIM_COOKIE = "deshiturf_claim"
