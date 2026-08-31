import { sql } from "drizzle-orm"

import { db } from "@/db"

import type { Side } from "./authority"
import { FORMATS } from "./formats"

/**
 * First-accept-wins seat claiming.
 *
 * The neon-http driver has no interactive transactions (db.transaction()
 * throws at runtime, though it type-checks) — the project idiom for atomic
 * multi-statement work is db.batch([...]), which runs as ONE server-side
 * transaction. Seat claims lock the match row first (SELECT ... FOR UPDATE):
 * a concurrent claim blocks on that lock, and its next statement's fresh
 * READ COMMITTED snapshot sees whatever the winner committed — so exactly
 * one claimant gets each seat, and the loser's conditional INSERT is a
 * no-op.
 *
 * Constraints to keep in mind (same as createMatchAction's batch):
 * statements can't reference each other's results, so the INSERT guards
 * itself with seatsFreeSql and the caller re-checks the outcome afterwards.
 */

/**
 * Lock the match row until the enclosing batch commits. Statement 1 of
 * every seat-claiming batch — one consistent lock order, no deadlocks
 * between the invite/guest/join-request paths.
 */
export function lockMatchForSeatClaim(matchId: string) {
  return db.execute(
    sql`SELECT id FROM matches WHERE id = ${matchId} FOR UPDATE`
  )
}

/**
 * SQL predicate: TRUE when the side still has a claimable seat. Mirrors
 * getSquadCounts/spotsLeft exactly — players + guests + the side's declared
 * placeholders against squad_size (legacy NULL rows fall back to the fives
 * max, same as the TS call sites). Pending invitations deliberately don't
 * appear here: they are prospects competing for the seat, not reservations.
 */
export function seatsFreeSql(matchId: string, side: Side) {
  return sql`(
    (
      SELECT count(*) FROM match_players
      WHERE match_id = ${matchId} AND side = ${side}
    ) + (
      SELECT count(*) FROM match_guests
      WHERE match_id = ${matchId} AND side = ${side}
    ) + COALESCE((
      SELECT CASE WHEN ${side} = 'home'
        THEN placeholder_count ELSE away_placeholder_count END
      FROM matches WHERE id = ${matchId}
    ), 0)
  ) < COALESCE((
    SELECT squad_size FROM matches WHERE id = ${matchId}
  ), ${FORMATS.fives.maxSquad})`
}
