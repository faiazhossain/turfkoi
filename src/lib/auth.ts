/**
 * Auth.js (next-auth v5) wiring lands in Phase 1.
 *
 * Strategy (SS39): JWT in an httpOnly, secure, SameSite=Strict cookie. Phone +
 * OTP is the primary identifier (audit D1) with brute-force protection
 * (audit D2): 6-digit code, 5-attempt lockout, 60s resend, per-phone rate
 * limit. OTP is mocked in dev (audit decision Q3); a BD SMS gateway
 * (SSL Wireless / Metoa / GreenWeb) is integrated before the auth launch.
 *
 * This stub exists so imports resolve during Phase 0.
 */
export interface AuthSession {
  user: { id: string; phone?: string | null; name?: string | null }
}

export async function getSession(): Promise<AuthSession | null> {
  // Phase 1: return await auth()
  return null
}
