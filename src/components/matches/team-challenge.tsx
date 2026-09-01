"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  challengeMatchAction,
  respondTeamChallengeAction,
} from "@/features/matches/actions"
import type { TeamChallenge } from "@/features/matches/queries"

export type ChallengeableView = {
  matchId: string
  matchOpen: boolean
  /** The visitor captains at least one team and may challenge. */
  canChallenge: boolean
  isHomeCaptain: boolean
  /** Teams the visitor can send a challenge with. */
  myTeams: { id: string; name: string }[]
  challenges: TeamChallenge[]
}

const STATUS_TONE: Record<TeamChallenge["status"], string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  accepted: "border-primary/40 bg-primary/10 text-primary",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted/50 text-muted-foreground",
  expired: "border-border bg-muted/50 text-muted-foreground",
}

/**
 * Team challenges (matchmaking.html §challenge): rival teams see an open
 * match and challenge as a unit; the home captain accepts or declines.
 * One accept locks the fixture — the same first-come-first-served away-side
 * claim as a person claim guards the race.
 */
export function TeamChallengePanel(view: ChallengeableView) {
  const { t, locale } = useI18n()
  const num = (n: number | string) =>
    locale === "bn" ? toBnDigits(String(n)) : String(n)

  const pending = view.challenges.filter((c) => c.status === "pending")
  const settled = view.challenges.filter((c) => c.status !== "pending")

  return (
    <section className="space-y-3" aria-label={t("matches.challenge.title")}>
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {t("matches.challenge.title")}
        </h2>
        {pending.length > 0 ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
            {num(pending.length)}
          </span>
        ) : null}
      </div>

      {/* Home captain: incoming challenges to accept/reject */}
      {view.isHomeCaptain && pending.length > 0 ? (
        <ul className="space-y-2">
          {pending.map((c) => (
            <PendingChallengeRow key={c.teamId} challenge={c} matchId={view.matchId} />
          ))}
        </ul>
      ) : null}

      {/* Visitor: send a challenge with one of their teams */}
      {view.canChallenge && view.myTeams.length > 0 ? (
        <SendChallengeCard matchId={view.matchId} teams={view.myTeams} />
      ) : null}

      {/* Outcome history — settled challenges, most recent first */}
      {settled.length > 0 ? (
        <ul className="space-y-1.5">
          {settled.map((c) => (
            <li
              key={c.teamId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-medium">{c.teamName}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[c.status]}`}
              >
                {t(`matches.challenge.status.${c.status}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function PendingChallengeRow({
  challenge,
  matchId,
}: {
  challenge: TeamChallenge
  matchId: string
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [pendingAction, start] = useTransition()
  const num = (n: number | string) =>
    locale === "bn" ? toBnDigits(String(n)) : String(n)

  function respond(accept: boolean) {
    start(async () => {
      const res = await respondTeamChallengeAction(matchId, challenge.teamId, accept)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t(accept ? "matches.challenge.acceptedToast" : "matches.challenge.declinedToast"))
      router.refresh()
    })
  }

  return (
    <li className="rounded-2xl border border-warning/40 bg-warning/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold">
            {challenge.teamName}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("matches.challenge.from", {
              captain: challenge.sentByName ?? t("matches.player"),
            })}
            {" · "}
            {t("matches.challenge.members", { count: num(challenge.memberCount) })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => respond(true)} loading={pendingAction}>
            {t("matches.challenge.accept")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => respond(false)}
            loading={pendingAction}
          >
            {t("matches.challenge.decline")}
          </Button>
        </div>
      </div>
    </li>
  )
}

function SendChallengeCard({
  matchId,
  teams,
}: {
  matchId: string
  teams: { id: string; name: string }[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [teamId, setTeamId] = useState("")
  const [sending, start] = useTransition()

  function send() {
    if (!teamId) return
    start(async () => {
      const res = await challengeMatchAction(matchId, teamId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.challenge.sentToast"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
      <p className="text-sm font-medium">{t("matches.challenge.sendTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("matches.challenge.sendDesc")}</p>
      <div className="flex gap-2">
        <Select value={teamId} onValueChange={(v) => setTeamId(String(v))}>
          <SelectTrigger className="w-full flex-1" aria-label={t("matches.challenge.selectTeam")}>
            <SelectValue>
              {(v: unknown) => {
                const selected = teams.find((tm) => tm.id === String(v))
                return selected ? selected.name : t("matches.challenge.selectTeam")
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {teams.map((tm) => (
              <SelectItem key={tm.id} value={tm.id}>
                {tm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={send} disabled={!teamId} loading={sending}>
          {t("matches.challenge.send")}
        </Button>
      </div>
    </div>
  )
}
