import Link from "next/link"
import { ClockIcon, PlusIcon, SwordsIcon, UserIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { matchTypeLabelKey } from "@/i18n/labels"
import { EmptyState, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { ClaimOpponentButton } from "@/components/matches/claim-opponent-button"
import { listOpenMatches } from "@/features/matches/queries"
import { getCurrentUser } from "@/lib/auth"

export async function generateMetadata() {
  return buildMetadata({
    titleKey: "metadata.matchesTitle",
    descriptionKey: "metadata.matchesDescription",
  })
}

export default async function MatchesPage() {
  const t = await getT()
  const user = await getCurrentUser()

  const matches = await listOpenMatches(30)

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("matches.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("matches.subtitle")}</p>
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

      {matches.length === 0 ? (
        <EmptyState
          icon={ClockIcon}
          title={t("matches.emptyTitle")}
          description={t("matches.emptyDesc")}
        />
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <SwordsIcon className="size-4 text-primary" aria-hidden />
            <h2 className="font-heading text-lg font-semibold">
              {t("matches.challengesTitle")}
            </h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
              {matches.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
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
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-heading font-semibold">
                        {m.legacyHomeTeamName ??
                          t("matches.soloTitle", {
                            captain: m.captainName ?? t("matches.player"),
                          })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.turfName}
                        {m.turfArea ? ` · ${m.turfArea}` : ""}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
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
                      <span className="text-xs text-muted-foreground tabular-nums">
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
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
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
      )}
    </div>
  )
}
