import type { Side } from "./authority"

/**
 * Pure match-event helpers (no db / server-only imports) — shared by the
 * actions, the match room, and the unit tests.
 */

export const MATCH_EVENT_TYPES = ["goal", "save", "tackle", "note"] as const
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number]

/**
 * Roster identity reference on an event: "p-<userId>" (match_players) or
 * "g-<guestId>" (match_guests) — the same convention SquadGroups uses for
 * its row keys. Null when malformed.
 */
export function parsePlayerRef(
  ref: string
): { kind: "player" | "guest"; id: string } | null {
  const m = /^(p|g)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
    ref.trim()
  )
  if (!m) return null
  return { kind: m[1] === "p" ? "player" : "guest", id: m[2] }
}

/**
 * Minute snapshot for a new event: whole minutes elapsed since kickoff,
 * clamped at 0 (captains may start the match early). Null when the match
 * has no kickoffAt — the event then simply renders without a chip.
 */
export function matchMinute(kickoffAt: Date | null, now?: Date): number | null {
  if (!kickoffAt) return null
  const start = kickoffAt.getTime()
  const elapsed = (now ?? new Date()).getTime() - start
  return Math.max(0, Math.floor(elapsed / 60000))
}

export type AggregatableEvent = {
  side: Side | null
  eventType: MatchEventType
  playerName: string | null
}

export type EventTally = { goal: number; save: number; tackle: number }

export type PlayerTally = {
  name: string
  side: Side | null
  goal: number
  save: number
  tackle: number
}

export type MatchEventStats = {
  home: EventTally
  away: EventTally
  /** Sorted by goal desc, then save, then tackle. */
  players: PlayerTally[]
}

const emptyTally = (): EventTally => ({ goal: 0, save: 0, tackle: 0 })

/**
 * Live tallies for the match room. Notes and player-less events contribute
 * to no tally; players are keyed by their name snapshot (stable across
 * anonymization) together with their side.
 */
export function aggregateMatchEvents(
  events: AggregatableEvent[]
): MatchEventStats {
  const home = emptyTally()
  const away = emptyTally()
  const players = new Map<string, PlayerTally>()

  for (const event of events) {
    if (event.eventType === "note" || event.side === null) continue
    const statType: keyof EventTally = event.eventType
    const tally = event.side === "home" ? home : away
    tally[statType] += 1

    if (!event.playerName) continue
    const key = `${event.side}:${event.playerName}`
    let player = players.get(key)
    if (!player) {
      player = {
        name: event.playerName,
        side: event.side,
        goal: 0,
        save: 0,
        tackle: 0,
      }
      players.set(key, player)
    }
    player[statType] += 1
  }

  return {
    home,
    away,
    players: [...players.values()].sort(
      (a, b) => b.goal - a.goal || b.save - a.save || b.tackle - a.tackle
    ),
  }
}
