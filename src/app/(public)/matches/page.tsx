import Link from "next/link"
import { ClockIcon, PlusIcon, SwordsIcon, UserIcon } from "lucide-react"

import type { MapMarker } from "@/components/map"
import { getLocale, getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { matchTypeLabelKey } from "@/i18n/labels"
import { EmptyState, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { ClaimOpponentButton } from "@/components/matches/claim-opponent-button"
import { MatchesSubNav } from "@/components/matches/matches-sub-nav"
import { MatchesMap } from "@/components/matches/matches-map"
import { MatchesSortControls } from "@/components/matches/matches-sort-controls"
import {
  formatDistanceKm,
  parseMatchesView,
} from "@/components/matches/matches-view"
import { KickoffCountdown } from "@/components/player/kickoff-countdown"
import { listOpenMatches } from "@/features/matches/queries"
import { slotStartEpochMs } from "@/lib/format-time"
import { getCurrentUser } from "@/lib/auth"

export async function generateMetadata() {
  return buildMetadata({
    titleKey: "metadata.matchesTitle",
    descriptionKey: "metadata.matchesDescription",
  })
}

interface PageProps {
  searchParams: Promise<{
    sort?: string
    lat?: string
    lng?: string
  }>
}

export default async function MatchesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = await getT()
  const locale = await getLocale()
  const user = await getCurrentUser()

  const view = parseMatchesView(sp)
  const matches = await listOpenMatches(30, {
    sort: view.sort,
    coords: view.coords,
  })

  const markers: MapMarker[] = matches.map((m) => ({
    id: m.id,
    lat: m.turfLat,
    lng: m.turfLng,
    label:
      m.legacyHomeTeamName ??
      t("matches.soloTitle", {
        captain: m.captainName ?? t("matches.player"),
      }),
    subtitle: [m.turfName, m.turfArea].filter(Boolean).join(" · "),
    href: `/matches/${m.id}`,
    kind: "battle",
    // The pin comes alive (swords clash) the moment the match kicks off —
    // same slot math as the card countdown, so they flip in sync.
    liveAt: slotStartEpochMs(m.date, m.slotStart.slice(0, 5)),
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("matches.title")}</h1>
          <p className="text-sm text-dt-dim">{t("matches.subtitle")}</p>
        </div>
        {user ? (
          <Button render={<Link href="/matches/new" />}>
            <PlusIcon aria-hidden />
            {t("matches.hubCreateCta")}
          </Button>
        ) : (
          <Button variant="outline" render={<Link href="/login" />}>
            <PlusIcon aria-hidden />
            {t("matches.hubCreateCta")}
          </Button>
        )}
      </header>

      <MatchesSubNav active="open" />

      {matches.length === 0 ? (
        <EmptyState
          icon={ClockIcon}
          title={t("matches.emptyTitle")}
          description={t("matches.emptyDesc")}
        />
      ) : (
        <>
          <div className="space-y-2">
            <MatchesSortControls view={view} />
            {view.sort === "near" && !view.coords ? (
              <p className="text-sm text-dt-dim">
                {t("matches.pickLocationHint")}
              </p>
            ) : null}
          </div>
          <MatchesMap
            markers={markers}
            pickedPoint={view.coords}
            ariaLabel={t("matches.mapAria")}
          />
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <SwordsIcon className="size-4 text-dt-green" aria-hidden />
              <h2 className="font-heading text-lg font-semibold">
                {t("matches.challengesTitle")}
              </h2>
              <span className="rounded-full bg-dt-green/10 px-2 py-0.5 text-xs font-medium text-dt-green tabular-nums">
                {matches.length}
              </span>
            </div>
            <p className="text-sm text-dt-dim">
              {t("matches.challengesDesc")}
            </p>
            <ul className="space-y-3">
              {matches.map((m) => {
                const myMatch =
                  user !== null &&
                  (m.captainId === user.id || m.awayCaptainId === user.id)
                const awayClaimed = m.awayCaptainId !== null
                const cap = m.squadSize ?? 0
                const playersWanted =
                  m.homeFilled < cap || (awayClaimed && m.awayFilled < cap)
                const showClaim = user !== null && !myMatch && !awayClaimed
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border border-dt-line bg-dt-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-heading font-semibold">
                          {m.legacyHomeTeamName ??
                            t("matches.soloTitle", {
                              captain: m.captainName ?? t("matches.player"),
                            })}
                        </p>
                        <p className="text-xs text-dt-dim">
                          {m.turfName}
                          {m.turfArea ? ` · ${m.turfArea}` : ""}
                          {m.distanceKm != null ? (
                            <span className="tabular-nums">
                              {" · "}
                              {formatDistanceKm(m.distanceKm, locale)}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 font-mono text-xs text-dt-dim">
                          {m.date} · {m.slotStart.slice(0, 5)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {myMatch ? (
                            <StatusBadge status="success" showIcon={false}>
                              {t("matches.yourMatchBadge")}
                            </StatusBadge>
                          ) : null}
                          {!awayClaimed ? (
                            <StatusBadge status="warning" showIcon>
                              <UserIcon className="size-3" aria-hidden />
                              {t("matches.hub.opponentWanted")}
                            </StatusBadge>
                          ) : null}
                          {playersWanted ? (
                            <StatusBadge status="info" showIcon={false}>
                              {t("matches.hub.playersWanted")}
                            </StatusBadge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge status="primary" showIcon={false}>
                          {t(matchTypeLabelKey(m.matchType))}
                        </StatusBadge>
                        <KickoffCountdown
                          kickoffMs={slotStartEpochMs(
                            m.date,
                            m.slotStart.slice(0, 5)
                          )}
                        />
                        <span className="text-xs text-dt-dim tabular-nums">
                          {t("matches.squad.hubFill", {
                            count: m.homeFilled,
                            total: cap,
                          })}
                        </span>
                        {showClaim ? (
                          <ClaimOpponentButton matchId={m.id} squadSize={cap} />
                        ) : null}
                        <Link
                          href={`/matches/${m.id}`}
                          className="text-xs text-dt-dim underline-offset-2 hover:underline"
                        >
                          {t("common.viewDetails")}
                        </Link>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
