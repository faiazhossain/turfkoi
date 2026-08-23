import Link from "next/link"
import { notFound } from "next/navigation"
import { MapPinIcon, ClockIcon } from "lucide-react"

import { StatusBadge, EmptyState } from "@/components/shared"
import { MapView } from "@/components/map"
import { MatchActions } from "@/components/matches/match-actions"
import { JoinRequestButton } from "@/components/player/join-request-button"
import { RequestManager } from "@/components/player/request-manager"
import { getMatch } from "@/features/matches/queries"
import { ROSTER_LIMITS } from "@/features/matches/schemas"
import { listTeamMembers, getTeamRole } from "@/features/teams/queries"
import {
  listPendingPlayerRequests,
  listAvailablePlayersNearTurf,
} from "@/features/player/queries"
import { getTurfLatLng } from "@/features/turfs/queries"
import { getCurrentUser } from "@/lib/auth"

interface PageProps {
  params: Promise<{ id: string }>
}

const STATE_TONE: Record<string, "success" | "warning" | "neutral" | "primary"> = {
  open: "warning",
  confirmed: "success",
  roster_building: "primary",
  ready: "success",
  ongoing: "primary",
  completed: "success",
  cancelled: "neutral",
  disputed: "warning",
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const user = await getCurrentUser()
  const { match: m, booking: b, turf: t, sides, roster } = match

  // Determine the user's teams in this match (teams where they're captain/owner).
  const myTeamOptions: { teamId: string; teamName: string; side: "home" | "away" }[] = []
  let teamMembers: { userId: string; name: string | null; phone: string }[] = []

  if (user) {
    for (const s of sides) {
      const role = await getTeamRole(s.teamId, user.id)
      if (role === "owner" || role === "captain") {
        myTeamOptions.push({
          teamId: s.teamId,
          teamName: s.teamName,
          side: s.side,
        })
      }
    }

    // If the user manages a team in this match, load its members for the roster add dropdown.
    if (myTeamOptions.length > 0 && ["confirmed", "roster_building"].includes(m.state)) {
      teamMembers = await listTeamMembers(myTeamOptions[0].teamId)
    }
  }

  // Compute open spots per team for the join button.
  const maxRoster = ROSTER_LIMITS[m.matchType]?.max ?? 8
  const openSpots = sides
    .map((s) => {
      const filled = roster.filter((p) => p.teamId === s.teamId).length
      return {
        teamId: s.teamId,
        teamName: s.teamName,
        open: Math.max(0, maxRoster - filled),
      }
    })
    .filter((s) => s.open > 0)

  // Load pending player requests for captains.
  let pendingRequests: {
    matchId: string; userId: string
    playerName: string | null; playerPhone: string
  }[] = []
  if (myTeamOptions.length > 0 && ["confirmed", "roster_building"].includes(m.state)) {
    const allReqs = await listPendingPlayerRequests(myTeamOptions.map((t) => t.teamId))
    pendingRequests = allReqs
      .filter((r) => r.matchId === m.id)
      .map((r) => ({
        matchId: r.matchId,
        userId: r.userId,
        playerName: r.playerName,
        playerPhone: r.playerPhone,
      }))
  }

  // Is the current user already on the roster?
  const onRoster = user ? roster.some((p) => p.userId === user.id) : false

  // Captains: solo players marked available near this turf (SS20/SS32).
  let nearbyPlayers: Awaited<ReturnType<typeof listAvailablePlayersNearTurf>> = []
  if (myTeamOptions.length > 0 && openSpots.length > 0) {
    const all = await listAvailablePlayersNearTurf(t.id)
    const rosterIds = new Set(roster.map((p) => p.userId))
    const requestedIds = new Set(pendingRequests.map((r) => r.userId))
    nearbyPlayers = all.filter(
      (p) => !rosterIds.has(p.userId) && !requestedIds.has(p.userId)
    )
  }
  const turfLatLng = nearbyPlayers.length > 0 ? await getTurfLatLng(t.id) : null

  const canConfirmResult =
    !!user &&
    m.state === "completed" &&
    m.resultStatus === "pending" &&
    user.id !== m.submittedBy &&
    myTeamOptions.length > 0

  const home = sides.find((s) => s.side === "home")
  const away = sides.find((s) => s.side === "away")

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/matches" className="hover:text-foreground">
          Matches
        </Link>{" "}
        / <span className="text-foreground">Match</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">
            {home?.teamName ?? "TBD"}
            {away ? ` vs ${away.teamName}` : ""}
          </h1>
          <StatusBadge status={STATE_TONE[m.state] ?? "neutral"} showIcon={false}>
            {m.state.replace(/_/g, " ")}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPinIcon className="size-4" aria-hidden />
          <Link href={`/turfs/${t.slug}`} className="hover:text-foreground">
            {t.name}
          </Link>
          {t.area ? ` · ${t.area}` : ""}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          <span className="font-mono">
            {b.date} · {b.slotStart.slice(0, 5)}
          </span>
        </div>
      </header>

      {/* Score */}
      {m.state === "completed" || m.state === "ongoing" ? (
        <div className="flex items-center justify-center gap-4 rounded-lg border border-border bg-card p-4">
          <span className="font-heading text-2xl font-bold tabular-nums">
            {m.homeScore ?? 0}
          </span>
          <span className="text-muted-foreground">–</span>
          <span className="font-heading text-2xl font-bold tabular-nums">
            {m.awayScore ?? 0}
          </span>
          {m.resultStatus !== "confirmed" ? (
            <StatusBadge status="warning" showIcon={false}>
              {m.resultStatus}
            </StatusBadge>
          ) : null}
        </div>
      ) : null}

      {/* Player matchmaking: join request + captain request management */}
      {user && ["confirmed", "roster_building"].includes(m.state) && !onRoster && myTeamOptions.length === 0 && openSpots.length > 0 ? (
        <JoinRequestButton matchId={m.id} spots={openSpots} />
      ) : null}

      {myTeamOptions.length > 0 && pendingRequests.length > 0 ? (
        <RequestManager teamId={myTeamOptions[0].teamId} requests={pendingRequests} />
      ) : null}

      {/* Captains: solo players available near this turf */}
      {myTeamOptions.length > 0 && openSpots.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">
            Players available nearby
          </h2>
          <p className="text-sm text-muted-foreground">
            Solo players marked available within 10 km of this turf. Locations
            are approximate (within ~100m).
          </p>
          {nearbyPlayers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No available players nearby right now. Your open spots are still
              visible to players searching this area.
            </p>
          ) : (
            <>
              <MapView
                ariaLabel="Available players near this turf"
                className="h-72"
                markers={[
                  ...(turfLatLng
                    ? [
                        {
                          id: "turf",
                          lat: turfLatLng.lat,
                          lng: turfLatLng.lng,
                          label: t.name,
                        },
                      ]
                    : []),
                  ...nearbyPlayers.map((p) => ({
                    id: p.userId,
                    lat: p.lat,
                    lng: p.lng,
                    label: `${p.name ?? "Player"}${p.position ? ` · ${p.position}` : ""}`,
                  })),
                ]}
              />
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {nearbyPlayers.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading font-medium">
                        {p.name ?? "Player"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[p.position, p.skill].filter(Boolean).join(" · ") ||
                          "Position not set"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3" aria-hidden />
                      {p.area || "Nearby"}
                      <span className="tabular-nums">
                        {p.distanceKm.toFixed(1)} km
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

      {user ? (
        <MatchActions
          matchId={m.id}
          matchState={m.state}
          matchType={m.matchType}
          homeScore={m.homeScore}
          awayScore={m.awayScore}
          resultStatus={m.resultStatus}
          sides={sides.map((s) => ({
            teamId: s.teamId,
            teamName: s.teamName,
            side: s.side,
          }))}
          roster={roster.map((p) => ({
            userId: p.userId,
            name: p.name,
            phone: p.phone,
            teamId: p.teamId,
            role: p.role,
          }))}
          myTeams={myTeamOptions}
          teamMembers={teamMembers}
          canConfirmResult={canConfirmResult}
        />
      ) : (
        <EmptyState
          title="Sign in to interact"
          description={
            m.state === "open"
              ? "Sign in to accept this match as an opponent."
              : "Sign in to view full match details."
          }
        />
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
