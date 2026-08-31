"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MemberPicker, type PickerMember } from "@/components/matches/member-picker"
import { GuestAddForm } from "@/components/matches/guest-add-form"
import {
  acceptAsOpponentAction,
  inviteMatchPlayersAction,
  submitResultAction,
  confirmResultAction,
} from "@/features/matches/actions"
import { leaveMatchAction } from "@/features/player/actions"
import { rosterOpen } from "@/features/matches/authority"

interface TeamOption {
  teamId: string
  teamName: string
  side: "home" | "away"
}

interface MatchActionsProps {
  matchId: string
  matchState: string
  homeScore: number | null
  awayScore: number | null
  resultStatus: string
  sides: TeamOption[]
  /** Teams the current user can act on (is captain/owner of). */
  myTeams: TeamOption[]
  /** Teams the user captains that are not in this match — can challenge. */
  challengeTeams: { teamId: string; teamName: string }[]
  /** Members of the user's first managed team (for the squad add panel). */
  teamMembers: PickerMember[]
  /** The user's friends not already on the roster — per-friend invite. */
  friends: PickerMember[]
  /** Whether the current user is the match captain. */
  isMatchCaptain: boolean
  /** Whether the current user is a rostered non-captain who can leave. */
  canLeave: boolean
  canConfirmResult: boolean
}

/**
 * Match-level actions: challenge (open team matches), squad additions from
 * the user's team, leave, and result submission/confirmation. Squad display
 * and promote/demote live in SquadGroups.
 */
export function MatchActions(props: MatchActionsProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [home, setHome] = useState(String(props.homeScore ?? 0))
  const [away, setAway] = useState(String(props.awayScore ?? 0))
  const [picks, setPicks] = useState<string[]>([])
  const [phone, setPhone] = useState("")

  const canChallenge =
    props.matchState === "open" &&
    props.challengeTeams.length > 0 &&
    props.sides.length > 0
  const canBuildSquad =
    rosterOpen(props.matchState) &&
    (props.myTeams.length > 0 || props.isMatchCaptain)
  const canSubmitResult =
    props.matchState === "ongoing" && props.myTeams.length > 0
  const canConfirm =
    props.matchState === "completed" &&
    props.resultStatus === "pending" &&
    props.canConfirmResult

  function challenge(teamId: string) {
    start(async () => {
      const res = await acceptAsOpponentAction(props.matchId, teamId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.challengeSent"))
      router.refresh()
    })
  }

  /** Invite picked members (and optionally a phone) — they must accept. */
  function invitePicked() {
    if (picks.length === 0 && !phone.trim()) return
    start(async () => {
      const res = await inviteMatchPlayersAction({
        matchId: props.matchId,
        userIds: picks,
        phones: phone.trim() ? [phone.trim()] : undefined,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.invite.sent"))
      setPicks([])
      setPhone("")
      router.refresh()
    })
  }

  function inviteFriend(userId: string) {
    start(async () => {
      const res = await inviteMatchPlayersAction({ matchId: props.matchId, userIds: [userId] })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.invite.sent"))
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
      {/* Challenge — captained teams not in this match can take the away side */}
      {canChallenge ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">{t("matches.challengeTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            {props.challengeTeams.map((tm) => (
              <Button
                key={tm.teamId}
                onClick={() => challenge(tm.teamId)}
                loading={pending}
              >
                {props.challengeTeams.length === 1
                  ? t("matches.challengeCta")
                  : t("matches.challengeAs", { team: tm.teamName })}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Squad invitations from the user's team + manual guest add */}
      {canBuildSquad ? (
        <section id="add-guest" className="scroll-mt-20 space-y-2">
          <h3 className="font-heading text-sm font-semibold">
            {t("matches.squad.addMembers")}
          </h3>
          {props.myTeams.length > 0 && props.teamMembers.length > 0 ? (
            <>
              <MemberPicker
                members={props.teamMembers}
                selected={picks}
                onToggle={(userId) =>
                  setPicks((prev) =>
                    prev.includes(userId)
                      ? prev.filter((id) => id !== userId)
                      : [...prev, userId]
                  )
                }
              />
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="invite-phone" className="text-xs">
                    {t("matches.invite.phoneLabel")}
                  </Label>
                  <Input
                    id="invite-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    className="w-40"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={invitePicked}
                  loading={pending}
                  disabled={picks.length === 0 && !phone.trim()}
                >
                  {t("matches.invite.cta")}
                </Button>
              </div>
            </>
          ) : null}
          {props.friends.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("matches.invite.friendsTitle")}</p>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {props.friends.map((f) => (
                  <li key={f.userId} className="flex items-center justify-between gap-2 bg-card p-2.5 text-sm">
                    <span className="min-w-0 truncate">{f.name ?? f.phone}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => inviteFriend(f.userId)}
                      loading={pending}
                    >
                      {t("matches.invite.cta")}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <GuestAddForm matchId={props.matchId} />
        </section>
      ) : null}

      {/* Solo captains recruit from the nearby list instead of a team. */}
      {canBuildSquad && props.myTeams.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("matches.addNearbyHint")}
        </p>
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
