import Link from "next/link"
import { ClockIcon, SwordsIcon, UserIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { matchTypeLabelKey } from "@/i18n/labels"
import { EmptyState, StatusBadge } from "@/components/shared"
import { ChallengeButton } from "@/components/matches/challenge-button"
import { listOpenMatches } from "@/features/matches/queries"
import { listMyTeams } from "@/features/teams/queries"
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

  // Teams this user captains — listOpenMatches already hides matches where
  // one of these is the home side, so every listed match is challengeable.
  const captainedTeams: { teamId: string; teamName: string }[] = []
  if (user) {
    const myTeams = await listMyTeams(user.id)
    for (const tm of myTeams) {
      if (tm.role === "owner" || tm.role === "captain") {
        captainedTeams.push({ teamId: tm.id, teamName: tm.name })
      }
    }
  }

  const matches = await listOpenMatches(
    captainedTeams.map((tm) => tm.teamId),
    30
  )

  // Team challenges (opponent wanted) vs solo recruiting (players wanted).
  const teamChallenges = matches.filter((m) => m.homeTeam)
  const soloOpen = matches.filter((m) => !m.homeTeam)
  const isEmpty = matches.length === 0

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header>
        <h1 className="font-heading text-2xl font-semibold">{t("matches.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("matches.subtitle")}</p>
      </header>

      {isEmpty ? (
        <EmptyState
          icon={ClockIcon}
          title={t("matches.emptyTitle")}
          description={t("matches.emptyDesc")}
        />
      ) : (
        <>
          {/* Open challenges — teams waiting for an opponent */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <SwordsIcon className="size-4 text-primary" aria-hidden />
              <h2 className="font-heading text-lg font-semibold">
                {t("matches.challengesTitle")}
              </h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
                {teamChallenges.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("matches.challengesDesc")}
            </p>
            {teamChallenges.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t("matches.noChallenges")}
              </p>
            ) : (
              <ul className="space-y-3">
                {teamChallenges.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-heading font-semibold">
                          {m.homeTeam?.teamName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.turfName}
                          {m.turfArea ? ` · ${m.turfArea}` : ""}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {m.date} · {m.slotStart.slice(0, 5)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge status="primary" showIcon={false}>
                          {t(matchTypeLabelKey(m.matchType))}
                        </StatusBadge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("matches.squad.hubFill", {
                            count: m.squadFilled,
                            total: m.squadSize ?? 0,
                          })}
                        </span>
                        {user ? (
                          <ChallengeButton
                            matchId={m.id}
                            teams={captainedTeams}
                          />
                        ) : (
                          <Link
                            href="/login"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                          >
                            {t("matches.signInChallenge")}
                          </Link>
                        )}
                        <Link
                          href={`/matches/${m.id}`}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {t("common.viewDetails")}
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Solo recruiting — captains looking for players */}
          {soloOpen.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <UserIcon className="size-4 text-primary" aria-hidden />
                <h2 className="font-heading text-lg font-semibold">
                  {t("matches.soloOpenTitle")}
                </h2>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
                  {soloOpen.length}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("matches.soloOpenDesc")}
              </p>
              <ul className="space-y-3">
                {soloOpen.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/matches/${m.id}`}
                      className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-heading font-semibold">
                            {t("matches.soloTitle", {
                              captain: m.captainName ?? t("matches.player"),
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.turfName}
                            {m.turfArea ? ` · ${m.turfArea}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status="primary" showIcon={false}>
                            {t(matchTypeLabelKey(m.matchType))}
                          </StatusBadge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {m.date} · {m.slotStart.slice(0, 5)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
