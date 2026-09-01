"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  submitResultAction,
  confirmResultAction,
  startMatchAction,
} from "@/features/matches/actions"
import { leaveMatchAction } from "@/features/player/actions"
import type { Side } from "@/features/matches/authority"

interface MatchActionsProps {
  matchId: string
  matchState: string
  homeScore: number | null
  awayScore: number | null
  resultStatus: string
  /** Side labels for the score inputs. */
  homeLabel: string
  awayLabel: string
  /** The side the current user manages, if any. */
  mySide: Side | null
  /** Whether the current user is a rostered non-captain who can leave. */
  canLeave: boolean
  canConfirmResult: boolean
}

/**
 * Match-level actions for a side captain: leave, result submission, and
 * result confirmation. Squad invitations and guest adds live in
 * SquadInvitePanel; squad display and promote/demote in SquadGroups.
 */
export function MatchActions(props: MatchActionsProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [home, setHome] = useState(String(props.homeScore ?? 0))
  const [away, setAway] = useState(String(props.awayScore ?? 0))

  const canSubmitResult =
    props.matchState === "ongoing" && props.mySide !== null
  const canConfirm =
    props.matchState === "completed" &&
    props.resultStatus === "pending" &&
    props.canConfirmResult
  // Kick-off: either side's captain starts whenever they're ready — pending
  // invites never block (their players are simply not on the final roster).
  const canStart =
    props.mySide !== null &&
    ["confirmed", "roster_building", "ready"].includes(props.matchState)

  function startMatch() {
    start(async () => {
      const res = await startMatchAction(props.matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.startedToast"))
      router.refresh()
    })
  }

  function leaveMatch() {
    start(async () => {
      const res = await leaveMatchAction(props.matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.leftMatchToast"))
      router.refresh()
    })
  }

  function submitResult() {
    start(async () => {
      const res = await submitResultAction({
        matchId: props.matchId,
        homeScore: Number(home),
        awayScore: Number(away),
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.resultSubmitted"))
      router.refresh()
    })
  }

  function confirmResult() {
    start(async () => {
      const res = await confirmResultAction(props.matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.resultConfirmed"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Kick-off — start with whoever is confirmed; pending never blocks. */}
      {canStart ? (
        <section className="space-y-2">
          <Button onClick={startMatch} loading={pending} className="w-full sm:w-auto">
            {t("matches.startCta")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("matches.startHint")}</p>
        </section>
      ) : null}

      {/* Leave match — rostered players can opt out before the match starts. */}
      {props.canLeave ? (
        <section className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={leaveMatch}
            loading={pending}
          >
            {t("matches.leaveMatch")}
          </Button>
        </section>
      ) : null}

      {/* Result submission */}
      {canSubmitResult ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">{t("matches.submitResult")}</h3>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{props.homeLabel}</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="w-20 text-center"
              />
            </div>
            <span className="pb-2 text-muted-foreground">–</span>
            <div className="space-y-1">
              <Label className="text-xs">{props.awayLabel}</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={away}
                onChange={(e) => setAway(e.target.value)}
                className="w-20 text-center"
              />
            </div>
            <Button onClick={submitResult} loading={pending}>
              {t("common.submit")}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Result confirmation */}
      {canConfirm ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">{t("matches.confirmResult")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("matches.score", { score: `${props.homeScore} – ${props.awayScore}` })}
          </p>
          <div className="flex gap-2">
            <Button onClick={confirmResult} loading={pending}>
              {t("matches.confirmResult")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
