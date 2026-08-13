import Link from "next/link"
import { notFound } from "next/navigation"
import { MapPinIcon, ClockIcon } from "lucide-react"

import { StatusBadge, EmptyState } from "@/components/shared"
import { MatchActions } from "@/components/matches/match-actions"
import { getMatch } from "@/features/matches/queries"
import { listMyTeams } from "@/features/teams/queries"
import { listTeamMembers, getTeamRole } from "@/features/teams/queries"
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
