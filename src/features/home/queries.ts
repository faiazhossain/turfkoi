import "server-only"
import { desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  matches,
  matchTeams,
  bookings,
  turfs,
  teams,
  users,
  playerProfiles,
} from "@/db/schema"

/**
 * Landing-page data: live/recent match results and real platform stats.
 * All numbers come straight from the DB — no marketing placeholders.
 */

/**
 * Matches worth showing on the scoreboard: everything live right now, then
 * the most recent completed results. Sides resolve to the team name, falling
 * back to the captain's name for solo matches.
 */
export async function listLiveAndRecentMatches(limit = 8) {
  const rows = await db
    .select({
      id: matches.id,
      state: matches.state,
      matchType: matches.matchType,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      kickoffAt: matches.kickoffAt,
      date: bookings.date,
      slotStart: bookings.slotStart,
      turfName: turfs.name,
      turfSlug: turfs.slug,
      captainName: users.name,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .leftJoin(users, eq(users.id, matches.captainId))
    .where(inArray(matches.state, ["ongoing", "completed"]))
    // Live matches first, then newest results.
    .orderBy(
      sql`case when ${matches.state} = 'ongoing' then 0 else 1 end`,
      desc(matches.kickoffAt)
    )
    .limit(limit)

  if (rows.length === 0) return []

  const sides = await db
    .select({
      matchId: matchTeams.matchId,
      teamName: teams.name,
      side: matchTeams.side,
    })
    .from(matchTeams)
    .innerJoin(teams, eq(teams.id, matchTeams.teamId))
    .where(
      inArray(
        matchTeams.matchId,
        rows.map((r) => r.id)
      )
    )

  return rows.map((r) => {
    const home = sides.find((s) => s.matchId === r.id && s.side === "home")
    const away = sides.find((s) => s.matchId === r.id && s.side === "away")
    return {
      ...r,
      // Solo matches have no team sides — the captain's name stands in.
      homeName: home?.teamName ?? r.captainName ?? null,
      awayName: away?.teamName ?? null,
    }
  })
}

/** Real platform counters for the landing stats strip and ticker. */
export async function getHomeStats() {
  const [turfRows, matchRows, availabilityRows] = await Promise.all([
    db
      .select({
        listed: sql<number>`count(*)::int`,
        cities: sql<number>`count(distinct ${turfs.city})::int`,
      })
      .from(turfs)
      .where(eq(turfs.isVerified, true)),
    db
      .select({
        completed: sql<number>`count(*) filter (where ${matches.state} = 'completed')::int`,
        // "Open challenge" = a team match waiting for an opponent (has a home
        // side). Solo recruiting matches are not challenges.
        open: sql<number>`count(*) filter (where ${matches.state} = 'open' and exists (select 1 from match_teams mt where mt.match_id = ${matches.id} and mt.side = 'home'))::int`,
        live: sql<number>`count(*) filter (where ${matches.state} = 'ongoing')::int`,
      })
      .from(matches),
    // SS18 freshness: the same 24h window the discovery queries use.
    db
      .select({ available: sql<number>`count(*)::int` })
      .from(playerProfiles)
      .where(
        sql`${playerProfiles.available} = true and ${playerProfiles.availableAt} >= now() - interval '24 hours'`
      ),
  ])

  return {
    turfs: turfRows[0]?.listed ?? 0,
    cities: turfRows[0]?.cities ?? 0,
    matchesPlayed: matchRows[0]?.completed ?? 0,
    openChallenges: matchRows[0]?.open ?? 0,
    liveNow: matchRows[0]?.live ?? 0,
    playersAvailable: availabilityRows[0]?.available ?? 0,
  }
}

export type HomeStats = Awaited<ReturnType<typeof getHomeStats>>
