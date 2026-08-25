"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  acceptAsOpponentAction,
  addPlayerAction,
  removePlayerAction,
  submitResultAction,
  confirmResultAction,
} from "@/features/matches/actions"

interface TeamOption {
  teamId: string
  teamName: string
  side: "home" | "away"
}

interface RosterPlayer {
  userId: string
  name: string | null
  phone: string
  teamId: string | null
  role: string
}

interface TeamMember {
  userId: string
  name: string | null
  phone: string
}

interface MatchActionsProps {
  matchId: string
  matchState: string
  matchType: string
  homeScore: number | null
  awayScore: number | null
  resultStatus: string
  sides: TeamOption[]
  roster: RosterPlayer[]
  /** Teams the current user can act on (is captain/owner of). */
  myTeams: TeamOption[]
  /** Members of each of the user's teams (for the roster add dropdown). */
  teamMembers: TeamMember[]
  canConfirmResult: boolean
}

export function MatchActions(props: MatchActionsProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [home, setHome] = useState(String(props.homeScore ?? 0))
  const [away, setAway] = useState(String(props.awayScore ?? 0))
  const [addTeamId, setAddTeamId] = useState(props.myTeams[0]?.teamId ?? "")
  const [addPlayerId, setAddPlayerId] = useState("")

  const canAccept =
    props.matchState === "open" && props.myTeams.length > 0
  const canBuildRoster =
    ["confirmed", "roster_building"].includes(props.matchState) &&
    props.myTeams.length > 0
  const canSubmitResult =
    props.matchState === "ongoing" && props.myTeams.length > 0
  const canConfirm =
    props.matchState === "completed" &&
    props.resultStatus === "pending" &&
    props.canConfirmResult

  function accept(teamId: string) {
    start(async () => {
      const res = await acceptAsOpponentAction(props.matchId, teamId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.youAreOpponent"))
      router.refresh()
    })
  }

  function addPlayer() {
    if (!addTeamId || !addPlayerId) return
    start(async () => {
      const res = await addPlayerAction(props.matchId, addTeamId, addPlayerId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.playerAdded"))
      setAddPlayerId("")
      router.refresh()
    })
  }

  function removePlayer(playerId: string) {
    start(async () => {
      const res = await removePlayerAction(props.matchId, playerId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.playerRemoved"))
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
      {/* Accept as opponent */}
      {canAccept ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">{t("matches.acceptAsOpponent")}</h3>
          <div className="flex flex-wrap gap-2">
            {props.myTeams.map((tm) => (
              <Button
                key={tm.teamId}
                onClick={() => accept(tm.teamId)}
                loading={pending}
              >
                {t("matches.acceptAs", { team: tm.teamName })}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Roster building */}
      {canBuildRoster ? (
        <section className="space-y-3">
          <h3 className="font-heading text-sm font-semibold">{t("matches.roster")}</h3>
          {props.myTeams.map((tm) => {
            const players = props.roster.filter((p) => p.teamId === tm.teamId)
            return (
              <div key={tm.teamId} className="space-y-2">
                <p className="text-sm font-medium">
                  {tm.teamName}{" "}
                  <span className="text-muted-foreground">
                    ({t("matches.side" + (tm.side === "home" ? "Home" : "Away"))})
                  </span>
                </p>
                {players.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("matches.noPlayers")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {players.map((p) => (
                      <li
                        key={p.userId}
                        className="flex items-center justify-between gap-2 bg-card p-2 text-sm"
                      >
                        <span>{p.name ?? p.phone}</span>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => removePlayer(p.userId)}
                          loading={pending}
                        >
                          {t("common.remove")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-end gap-2">
                  <Select
                    value={addPlayerId}
                    onValueChange={(v) => v && setAddPlayerId(v)}
                  >
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue placeholder={t("matches.addPlayer")} />
                    </SelectTrigger>
                    <SelectContent>
                      {props.teamMembers.map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.name ?? m.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => {
                      setAddTeamId(tm.teamId)
                      addPlayer()
                    }}
                    disabled={!addPlayerId}
                    loading={pending}
                  >
                    {t("common.add")}
                  </Button>
                </div>
              </div>
            )
          })}
        </section>
      ) : null}

      {/* Result submission */}
      {canSubmitResult ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">{t("matches.submitResult")}</h3>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">
                {props.sides.find((s) => s.side === "home")?.teamName ?? t("matches.home")}
              </Label>
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
              <Label className="text-xs">
                {props.sides.find((s) => s.side === "away")?.teamName ?? t("matches.away")}
              </Label>
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
