import Link from "next/link"
import { MapPinIcon, ClockIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { listOpenMatches } from "@/features/matches/queries"
import { listMyTeams } from "@/features/teams/queries"
import { getCurrentUser } from "@/lib/auth"

export default async function MatchesPage() {
  const user = await getCurrentUser()
  const teamIds: string[] = []

  if (user) {
    const myTeams = await listMyTeams(user.id)
    teamIds.push(...myTeams.map((t) => t.id))
  }

  const matches = await listOpenMatches(teamIds, 30)

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Find a match</h1>
        <p className="text-sm text-muted-foreground">
          Open matches looking for an opposing team.
        </p>
      </header>

      {matches.length === 0 ? (
        <EmptyState
          icon={ClockIcon}
          title="No open matches right now"
          description="Teams with confirmed bookings will appear here when they're looking for opponents."
        />
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/matches/${m.id}`}
                className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-heading font-semibold">
                      {m.homeTeam?.teamName ?? "Team TBD"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.turfName}
                      {m.turfArea ? ` · ${m.turfArea}` : ""}
                    </p>
                  </div>
                  <StatusBadge status="primary" showIcon={false}>
                    {m.matchType === "fives" ? "5-a-side" : "7-a-side"}
                  </StatusBadge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {m.date} · {m.slotStart.slice(0, 5)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
