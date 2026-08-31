/**
 * Match formats and squad math — pure functions, safe to import from client
 * components and tests (no server-only deps).
 *
 * Two separate concepts (never conflate them):
 * - FORMAT ("match type"): players per side ON THE FIELD. 7v7 = 7 on the
 *   field — it does NOT cap the squad.
 * - SQUAD SIZE (`matches.squadSize`): total participants per side, including
 *   substitutes. Always >= starters for the format.
 */
export const FORMATS = {
  fives: { starters: 5, maxSquad: 12 },
  sevens: { starters: 7, maxSquad: 14 },
  nines: { starters: 9, maxSquad: 16 },
  elevens: { starters: 11, maxSquad: 18 },
} as const

export type MatchFormat = keyof typeof FORMATS

export const MATCH_FORMATS = Object.keys(FORMATS) as MatchFormat[]

export function isMatchFormat(v: string): v is MatchFormat {
  return v in FORMATS
}

export function startersOf(format: MatchFormat): number {
  return FORMATS[format].starters
}

export function isValidSquadSize(format: MatchFormat, squadSize: number): boolean {
  const { starters, maxSquad } = FORMATS[format]
  return Number.isInteger(squadSize) && squadSize >= starters && squadSize <= maxSquad
}

export function defaultSquadSize(format: MatchFormat): number {
  // A couple of subs by default — organizers adjust from there.
  return Math.min(FORMATS[format].starters + 3, FORMATS[format].maxSquad)
}

/**
 * Which squad slot an accepted player gets: honor "starting" only while the
 * starting group has room, otherwise bench them.
 */
export function resolveSquadRole(
  acceptedStarting: number,
  format: MatchFormat
): "starting" | "substitute" {
  return acceptedStarting < FORMATS[format].starters ? "starting" : "substitute"
}

/**
 * Remaining squad spots for a side. Pending invites consume spots so the
 * squad can't be over-booked; a decline/cancel releases them. Count-first
 * matchmaking: placeholder seats ("আমার ৭ জন আছে" without naming them) also
 * consume spots. Never negative.
 */
export function spotsLeft(
  squadSize: number,
  acceptedCount: number,
  pendingCount = 0,
  placeholderCount = 0
): number {
  return Math.max(
    0,
    squadSize - acceptedCount - pendingCount - placeholderCount
  )
}

/**
 * Largest placeholder count a side can hold given what it has already
 * identified (players + guests) and pending invites — i.e. the seats that
 * are still completely unclaimed. Used by the count editor (server action
 * and client UI) so declared counts can never exceed the squad.
 */
export function placeholdersUpperBound(
  squadSize: number,
  identifiedCount: number,
  pendingCount = 0
): number {
  return Math.max(0, squadSize - identifiedCount - pendingCount)
}
