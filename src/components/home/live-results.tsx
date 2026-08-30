import Link from "next/link"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared"
import { getT } from "@/i18n/server"
import { matchStateLabel, turfFormatLabelKey } from "@/i18n/labels"
import {
  getHomeStats,
  listLiveAndRecentMatches,
} from "@/features/home/queries"

import { Reveal } from "./reveal"

/**
 * Landing live scoreboard: real matches from the database — everything
 * currently ONGOING plus the most recent completed results — with an
 * LED-board style activity ticker (real platform counters, no simulation).
 * The ticker track renders its items twice for a seamless CSS marquee.
 */
export async function LiveResults() {
  const [t, results, stats] = await Promise.all([
    getT(),
    listLiveAndRecentMatches(),
    getHomeStats(),
  ])

  const live = results.filter((m) => m.state === "ongoing")
  const recent = results.filter((m) => m.state === "completed")

  const tbd = t("home.liveTbdSide")
  const tickerItems: string[] = []
  for (const m of live.slice(0, 3)) {
    tickerItems.push(
      t("home.tickerLiveNow", {
        home: m.homeName ?? tbd,
        away: m.awayName ?? tbd,
      })
    )
  }
  const latest = recent[0]
  if (latest) {
    tickerItems.push(
      t("home.tickerLatestResult", {
        home: latest.homeName ?? tbd,
        score: `${latest.homeScore ?? 0}-${latest.awayScore ?? 0}`,
        away: latest.awayName ?? tbd,
      })
    )
  }
  tickerItems.push(t("home.tickerOpenChallenges", { count: stats.openChallenges }))
  tickerItems.push(
    t("home.tickerPlayersAvailable", { count: stats.playersAvailable })
  )
  tickerItems.push(t("home.tickerMatchesPlayed", { count: stats.matchesPlayed }))

  const tickerRow = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      className="flex w-max shrink-0 items-center gap-10 whitespace-nowrap px-5 py-2.5 text-sm text-muted-foreground"
    >
      {tickerItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("home.liveTitle")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("home.liveSubtitle")}</p>
      </Reveal>

      {/* LED-board ticker */}
      <Reveal delay={0.05}>
        <div className="mt-10 flex items-stretch overflow-hidden rounded-lg border border-border bg-card">
          <span className="flex shrink-0 items-center gap-2 bg-destructive/15 px-3 text-xs font-bold tracking-wide text-destructive">
            <span
              className="size-1.5 rounded-full bg-destructive motion-safe:animate-pulse"
              aria-hidden
            />
            {t("home.liveTickerLabel")}
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="home-ticker-track flex w-max">
              {tickerRow(false)}
              {tickerRow(true)}
            </div>
          </div>
        </div>
      </Reveal>

      {results.length === 0 ? (
        <Reveal delay={0.1}>
          <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("home.liveEmpty")}
          </p>
        </Reveal>
      ) : (
        <>
          {live.length > 0 ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {live.map((m, i) => (
                <Reveal key={m.id} delay={0.1 + i * 0.05} className="h-full">
                  <article className="h-full rounded-lg border border-border bg-card p-5 shadow-low">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/turfs/${m.turfSlug}`}
                        className="truncate text-sm font-medium hover:text-primary"
                      >
                        {m.turfName}
                      </Link>
                      <StatusBadge status="danger" showIcon={false}>
                        {t("home.liveTickerLabel")}
                      </StatusBadge>
                    </div>
                    <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <p className="truncate text-sm font-semibold">
                        {m.homeName ?? tbd}
                      </p>
                      <p className="font-heading text-4xl font-bold tabular-nums">
                        {m.homeScore ?? 0}
                        <span className="mx-1.5 text-lg text-muted-foreground">
                          :
                        </span>
                        {m.awayScore ?? 0}
                      </p>
                      <p className="truncate text-right text-sm font-semibold">
                        {m.awayName ?? tbd}
                      </p>
                    </div>
                    <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t(turfFormatLabelKey(m.matchType))}</span>
                      <span className="font-mono">
                        {m.date} · {m.slotStart.slice(0, 5)}
                      </span>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          ) : null}

          {recent.length > 0 ? (
            <Reveal delay={0.1} className="mt-8">
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {recent.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/matches/${m.id}`}
                      className="flex items-center gap-3 bg-card p-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="w-12 shrink-0 text-center font-heading text-base font-bold tabular-nums">
                        {m.homeScore ?? 0} : {m.awayScore ?? 0}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {m.homeName ?? tbd}{" "}
                        <span className="text-muted-foreground">vs</span>{" "}
                        {m.awayName ?? tbd}
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {m.turfName}
                      </span>
                      <StatusBadge status="neutral" showIcon={false}>
                        {t(matchStateLabel(m.state))}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}

          <Reveal delay={0.15} className="mt-6 text-center">
            <Button variant="outline" size="sm" render={<Link href="/matches" />}>
              {t("home.liveViewAll")}
            </Button>
          </Reveal>
        </>
      )}
    </section>
  )
}
