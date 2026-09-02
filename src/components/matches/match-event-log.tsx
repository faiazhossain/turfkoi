import { HandIcon, ShieldIcon, StickyNoteIcon, TargetIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { MatchEventView } from "@/features/matches/queries"
import type { MatchEventStats, MatchEventType } from "@/features/matches/events"
import { matchEventTypeLabelKey } from "@/i18n/labels"
import { getT } from "@/i18n/server"
import { toBnDigits } from "@/lib/format-time"
import { MatchEventDeleteButton } from "./match-event-delete-button"

const EVENT_ICONS: Record<MatchEventType, LucideIcon> = {
  goal: TargetIcon,
  save: HandIcon,
  tackle: ShieldIcon,
  note: StickyNoteIcon,
}

/**
 * The live event log: per-side tallies, then the chronological timeline.
 * Server-rendered; deletion is the one interactive bit (client island).
 */
export async function MatchEventLog({
  matchId,
  events,
  stats,
  canLog,
  locale,
}: {
  matchId: string
  events: MatchEventView[]
  stats: MatchEventStats
  canLog: boolean
  locale: "en" | "bn"
}) {
  const t = await getT()
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))
  const sideLabel = (side: "home" | "away") =>
    side === "home" ? t("matches.sideHome") : t("matches.sideAway")

  return (
    <section className="space-y-3" aria-label={t("matches.events.title")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {t("matches.events.statsTitle")}
        </h2>
        <span className="text-xs text-dt-dim">
          {t("matches.logs.goals")} {num(stats.home.goal)}–{num(stats.away.goal)}
          {" · "}
          {t("matches.logs.saves")} {num(stats.home.save)}–{num(stats.away.save)}
          {" · "}
          {t("matches.logs.tackles")} {num(stats.home.tackle)}–
          {num(stats.away.tackle)}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-dt-line p-4 text-sm text-dt-dim">
          {t("matches.events.empty")}
        </p>
      ) : (
        <ol className="space-y-2">
          {events.map((e) => {
            const Icon = EVENT_ICONS[e.eventType as MatchEventType] ?? StickyNoteIcon
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-dt-line bg-dt-card p-3 text-sm"
              >
                {e.minute != null ? (
                  <span
                    className="mt-0.5 font-mono text-xs text-dt-dim tabular-nums"
                    aria-label={t("matches.events.minuteAria", {
                      minute: num(e.minute),
                    })}
                  >
                    {num(e.minute)}{"'"}
                  </span>
                ) : null}
                <Icon className="mt-0.5 size-4 shrink-0 text-dt-green" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">
                    <span className="font-medium">
                      {t(matchEventTypeLabelKey(e.eventType))}
                    </span>
                    {e.playerName ? (
                      <>
                        {" — "}
                        <span className="font-medium">{e.playerName}</span>
                      </>
                    ) : null}
                    {e.side ? (
                      <span className="ml-1.5 text-xs text-dt-dim">
                        ({sideLabel(e.side)})
                      </span>
                    ) : null}
                  </p>
                  {e.note ? (
                    <p className="mt-0.5 text-xs text-dt-dim">{e.note}</p>
                  ) : null}
                </div>
                {canLog ? (
                  <MatchEventDeleteButton matchId={matchId} eventId={e.id} />
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
