import { normalizePhone } from "@/features/auth/phone"

/** A prefill candidate for the guest quick-add chips (serializable). */
export interface RecentGuestPick {
  name: string
  phone: string | null
  position: string | null
  jerseyNumber: number | null
}

/**
 * Collapse the guests a captain previously added into quick-add picks,
 * newest first (rows must arrive newest-first). Identity is the normalized
 * phone when known, else the trimmed lowercase name; the first occurrence
 * wins.
 */
export function dedupeRecentGuests(
  rows: RecentGuestPick[],
  limit: number
): RecentGuestPick[] {
  const seen = new Set<string>()
  const picks: RecentGuestPick[] = []
  for (const row of rows) {
    const key = row.phone
      ? `phone:${normalizePhone(row.phone)}`
      : `name:${row.name.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    picks.push({
      name: row.name,
      phone: row.phone,
      position: row.position,
      jerseyNumber: row.jerseyNumber,
    })
    if (picks.length >= limit) break
  }
  return picks
}
