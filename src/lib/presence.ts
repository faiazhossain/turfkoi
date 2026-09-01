/**
 * Pure presence helpers (Player Network) — safe for client components.
 * "Online" = the player was seen browsing a signed-in page recently.
 */
export const PRESENCE_ONLINE_WINDOW_MINUTES = 5
const WINDOW_MS = PRESENCE_ONLINE_WINDOW_MINUTES * 60 * 1000

export function isPresenceOnline(
  lastSeenAt: Date | string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!lastSeenAt) return false
  const seen = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt
  return now - seen.getTime() < WINDOW_MS
}
