"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
        toast.error(res.error)
        return
      }
      toast.success("You're the opponent!")
      router.refresh()
    })
  }

  function addPlayer() {
    if (!addTeamId || !addPlayerId) return
    start(async () => {
      const res = await addPlayerAction(props.matchId, addTeamId, addPlayerId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Player added to roster.")
      setAddPlayerId("")
      router.refresh()
    })
  }

  function removePlayer(playerId: string) {
    start(async () => {
      const res = await removePlayerAction(props.matchId, playerId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Player removed.")
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
        toast.error(res.error)
        return
      }
      toast.success("Result submitted — awaiting opponent confirmation.")
      router.refresh()
    })
  }

  function confirmResult() {
    start(async () => {
      const res = await confirmResultAction(props.matchId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Result confirmed.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Accept as opponent */}
      {canAccept ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">Accept as opponent</h3>
          <div className="flex flex-wrap gap-2">
            {props.myTeams.map((t) => (
              <Button
                key={t.teamId}
                onClick={() => accept(t.teamId)}
                disabled={pending}
              >
                Accept as {t.teamName}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Roster building */}
      {canBuildRoster ? (
        <section className="space-y-3">
          <h3 className="font-heading text-sm font-semibold">Roster</h3>
          {props.myTeams.map((t) => {
            const players = props.roster.filter((p) => p.teamId === t.teamId)
            return (
              <div key={t.teamId} className="space-y-2">
                <p className="text-sm font-medium">
                  {t.teamName}{" "}
                  <span className="text-muted-foreground">
                    ({t.side})
                  </span>
                </p>
                {players.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No players added yet.
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
                          disabled={pending}
                        >
                          Remove
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
                      <SelectValue placeholder="Add player…" />
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
                      setAddTeamId(t.teamId)
                      addPlayer()
                    }}
                    disabled={pending || !addPlayerId}
                  >
                    Add
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
          <h3 className="font-heading text-sm font-semibold">Submit result</h3>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">
                {props.sides.find((s) => s.side === "home")?.teamName ?? "Home"}
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
                {props.sides.find((s) => s.side === "away")?.teamName ?? "Away"}
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
            <Button onClick={submitResult} disabled={pending}>
              Submit
            </Button>
          </div>
        </section>
      ) : null}

      {/* Result confirmation */}
      {canConfirm ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">Confirm result</h3>
          <p className="text-sm text-muted-foreground">
            Score: {props.homeScore} – {props.awayScore}
          </p>
          <div className="flex gap-2">
            <Button onClick={confirmResult} disabled={pending}>
              Confirm result
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
