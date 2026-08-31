/**
 * Match-history merge — pure logic (no db imports) so the unit suite can
 * cover the linking rules directly.
 *
 * A player's history has two sources: their own match_players rows, and
 * match_guests rows a captain recorded for them before they had an account
 * (linked by signup, see linkMatchInvitationsAndGuests). When both exist for
 * one match (recorded as a guest, later also invited), the rostered row
 * wins.
 */

/** Row sourced from match_players (the player's own roster entry). */
export interface PlayerHistoryRow {
  matchId: string
  state: string
  matchType: string
  homeScore: number | null
  awayScore: number | null
  date: string
  slotStart: string
  turfName: string
  playedConfirmedAt: Date | null
  kickoffAt: Date | null
}

/** Row sourced from match_guests — no "I played" confirmation exists. */
export type GuestHistoryRow = Omit<PlayerHistoryRow, "playedConfirmedAt">

export interface MergedHistoryRow {
  id: string
  state: string
  matchType: string
  homeScore: number | null
  awayScore: number | null
  date: string
  slotStart: string
  turfName: string
  playedConfirmedAt: Date | null
  /** Recorded by a captain as an account-less guest, not rostered personally. */
  asGuest: boolean
}

export function mergeMatchHistory(
  playerRows: PlayerHistoryRow[],
  guestRows: GuestHistoryRow[],
  limit: number
): MergedHistoryRow[] {
  type Entry = MergedHistoryRow & { kickoffAt: Date | null }
  const byMatch = new Map<string, Entry>()
  for (const row of playerRows) {
    byMatch.set(row.matchId, { ...row, id: row.matchId, asGuest: false })
  }
  for (const row of guestRows) {
    // The rostered row wins; among guest rows the first (newest) wins.
    if (byMatch.has(row.matchId)) continue
    byMatch.set(row.matchId, {
      ...row,
      id: row.matchId,
      playedConfirmedAt: null,
      asGuest: true,
    })
  }
  const sorted = [...byMatch.values()].sort((a, b) => {
    const ta = a.kickoffAt?.getTime() ?? null
    const tb = b.kickoffAt?.getTime() ?? null
    if (ta !== null && tb !== null && ta !== tb) return tb - ta
    if (ta === null && tb !== null) return 1
    if (ta !== null && tb === null) return -1
    // Fall back to the booking's slot — date and time sort naturally as
    // strings ("YYYY-MM-DD", "HH:MM").
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return b.slotStart.localeCompare(a.slotStart)
  })
  return sorted.slice(0, limit).map((row) => ({
    id: row.id,
    state: row.state,
    matchType: row.matchType,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    date: row.date,
    slotStart: row.slotStart,
    turfName: row.turfName,
    playedConfirmedAt: row.playedConfirmedAt,
    asGuest: row.asGuest,
  }))
}
