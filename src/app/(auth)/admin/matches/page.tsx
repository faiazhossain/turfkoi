import type { Metadata } from "next"
import Link from "next/link"

import { StatusBadge } from "@/components/shared"
import { ResolveDisputeButtons } from "@/components/admin"
import { listDisputedMatches } from "@/features/admin/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { matchStateLabel } from "@/i18n/labels"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminMatchesTitle" })
}

export default async function AdminMatchesPage() {
  const t = await getT()
  const matches = await listDisputedMatches()

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold">{t("admin.matches.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("admin.matches.desc")}</p>
      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("admin.matches.empty")}
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
                    {t(matchStateLabel(m.state))}
                  </StatusBadge>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {m.createdAt.toISOString().slice(0, 10)}
                  {m.kickoffAt
                    ? ` · ${t("admin.matches.kickoff", { time: m.kickoffAt.toISOString().slice(0, 16) })}`
                    : ""}
                </p>
                {m.homeScore != null && m.awayScore != null ? (
                  <p className="text-sm tabular-nums">
                    {t("admin.matches.submittedScore", { home: m.homeScore, away: m.awayScore })}
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
