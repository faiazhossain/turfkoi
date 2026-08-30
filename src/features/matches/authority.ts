/**
 * Pure match-authority helpers — no db or server-only imports so they can be
 * unit-tested and reused from client-safe modules (e.g. the notification
 * registry).
 */

/** Team-internal roles that confer captain authority over a side. */
export function isCaptainRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "captain"
}

/** Match states in which the roster can still be edited. */
export const ROSTER_OPEN_STATES = ["open", "confirmed", "roster_building"] as const

export function rosterOpen(state: string): boolean {
  return (ROSTER_OPEN_STATES as readonly string[]).includes(state)
}

export function hasFreeSpot(count: number, max: number): boolean {
  return count < max
}

/**
 * Kickoff label for notification payloads: "2026-08-24 • 20:00" (UTC —
 * kickoffAt is stored/read as UTC across the app), or null when unknown.
 */
export function formatKickoffLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
  return `${date} • ${time}`
}
