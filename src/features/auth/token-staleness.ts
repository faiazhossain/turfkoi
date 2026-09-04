/**
 * Token versioning for JWT sessions: a token issued BEFORE the account's last
 * password change is stale and must be treated as unauthenticated. This is
 * what makes a password reset evict existing sessions (audit hardening item).
 * NULL passwordChangedAt = password never changed since creation -> any token
 * issued since sign-up is valid.
 */
export function isTokenStale(
  iatSeconds: number | undefined,
  passwordChangedAt: Date | null
): boolean {
  if (!passwordChangedAt) return false
  if (iatSeconds === undefined) return true
  return passwordChangedAt.getTime() > iatSeconds * 1000
}
