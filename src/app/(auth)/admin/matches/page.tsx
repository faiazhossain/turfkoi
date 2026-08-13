import Link from "next/link"

import { StatusBadge } from "@/components/shared"
import { ResolveDisputeButtons } from "@/components/admin"
import { listDisputedMatches } from "@/features/admin/queries"

export default async function AdminMatchesPage() {
  const matches = await listDisputedMatches()

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold">Disputed matches</h2>
      <p className="text-sm text-muted-foreground">
        Confirm the result (optionally overriding the score) or scratch the
        match entirely. Decision set per audit B4.
      </p>
      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No matches are currently disputed.
        </p>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/matches/${m.id}`}
                    className="truncate font-heading font-medium hover:underline"
                  >
                    {m.turfName}
                  </Link>
                  <StatusBadge status="danger" showIcon={false}>
                    {m.state.replace(/_/g, " ")}
                  </StatusBadge>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {m.createdAt.toISOString().slice(0, 10)}
                  {m.kickoffAt
                    ? ` · kickoff ${m.kickoffAt.toISOString().slice(0, 16)}`
                    : ""}
                </p>
                {m.homeScore != null && m.awayScore != null ? (
                  <p className="text-sm tabular-nums">
                    Submitted score: {m.homeScore}–{m.awayScore}
                  </p>
                ) : null}
              </div>
              <ResolveDisputeButtons
                matchId={m.id}
                homeScore={m.homeScore}
                awayScore={m.awayScore}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
