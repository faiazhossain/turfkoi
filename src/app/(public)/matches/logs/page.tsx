import Link from "next/link"
import { ClockIcon } from "lucide-react"

import { MatchesSubNav } from "@/components/matches/matches-sub-nav"
import { EmptyState, StatusBadge } from "@/components/shared"
import { listMatchLogs } from "@/features/matches/queries"
import { getLocale, getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { matchStateLabel, matchTypeLabelKey } from "@/i18n/labels"
import { formatSlotDate } from "@/lib/format-date"
import { formatSlotTime, toBnDigits } from "@/lib/format-time"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  return buildMetadata({
    titleKey: "matches.logs.title",
    descriptionKey: "matches.logs.subtitle",
  })
}

const LOG_TONE: Record<string, "success" | "warning" | "neutral" | "primary"> = {
  ongoing: "primary",
  completed: "success",
}

export default async function MatchLogsPage() {
  const [t, locale, logs] = await Promise.all([getT(), getLocale(), listMatchLogs(30)])
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold">
          {t("matches.logs.title")}
        </h1>
        <p className="text-sm text-dt-dim">{t("matches.logs.subtitle")}</p>
      </header>

      <MatchesSubNav active="logs" />

      {logs.length === 0 ? (
        <EmptyState
          icon={ClockIcon}
          title={t("matches.logs.emptyTitle")}
          description={t("matches.logs.emptyDesc")}
        />
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li key={log.id}>
              <Link
                href={`/matches/${log.id}`}
                className="block rounded-lg border border-dt-line bg-dt-card p-4 transition-colors hover:bg-dt-card2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-heading font-semibold">
                      {log.homeSideName ?? t("matches.player")}{" "}
                      {t("matches.logs.vs")}{" "}
                      {log.awaySideName ?? t("matches.player")}
                    </p>
                    <p className="text-xs text-dt-dim">{log.turfName}</p>
                    <p className="mt-1 font-mono text-xs text-dt-dim">
                      {formatSlotDate(log.date, locale)} ·{" "}
                      {formatSlotTime(log.slotStart.slice(0, 5), locale)}
                    </p>
                    <StatusBadge status="primary" showIcon={false}>
                      {t(matchTypeLabelKey(log.matchType))}
                    </StatusBadge>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {log.homeScore != null && log.awayScore != null ? (
                      <span className="match-score text-2xl font-bold tabular-nums">
                        {num(log.homeScore)} – {num(log.awayScore)}
                      </span>
                    ) : (
                      <span className="text-xs text-dt-dim">
                        {t("matches.logs.noScore")}
                      </span>
                    )}
                    {log.state === "ongoing" ? (
                      <StatusBadge status="success" showIcon={false}>
                        <span className="relative flex size-2" aria-hidden>
                          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-dt-green opacity-75" />
                          <span className="relative inline-flex size-2 rounded-full bg-dt-green" />
                        </span>
                        {t("matches.logs.liveBadge")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge
                        status={LOG_TONE[log.state] ?? "neutral"}
                        showIcon={false}
                      >
                        {t(matchStateLabel(log.state))}
                      </StatusBadge>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
