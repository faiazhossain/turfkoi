"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { acceptAsOpponentAction } from "@/features/matches/actions"

/**
 * Inline "Challenge" CTA for open matches on the matches list. One button per
 * captained team (usually one). First challenge wins — the match is confirmed
 * on the spot, so this component disappears after a refresh.
 */
export function ChallengeButton({
  matchId,
  teams,
}: {
  matchId: string
  teams: { teamId: string; teamName: string }[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  if (teams.length === 0) return null

  function challenge(teamId: string) {
    start(async () => {
      const res = await acceptAsOpponentAction(matchId, teamId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.challengeSent"))
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      {teams.map((tm) => (
        <Button
          key={tm.teamId}
          size="sm"
          onClick={() => challenge(tm.teamId)}
          loading={pending}
        >
          {teams.length === 1
            ? t("matches.challengeCta")
            : t("matches.challengeAs", { team: tm.teamName })}
        </Button>
      ))}
    </div>
  )
}
