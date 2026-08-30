"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { requestToJoinAction } from "@/features/player/actions"

interface TeamSpot {
  /** null = a solo match's synthetic spot (no team side). */
  teamId: string | null
  teamName: string | null
  open: number
}

export function JoinRequestButton({
  matchId,
  spots,
}: {
  matchId: string
  spots: TeamSpot[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  if (spots.length === 0) return null

  function join(teamName: string | null) {
    start(async () => {
      const res = await requestToJoinAction(matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(
        teamName
          ? t("matches.requestedJoin", { team: teamName })
          : t("matches.requestedJoinSolo")
      )
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {spots.map((s) => (
        <Button
          key={s.teamId ?? "solo"}
          size="sm"
          variant="outline"
          onClick={() => join(s.teamName)}
          loading={pending}
        >
          {s.teamName
            ? t("matches.requestToJoin", { team: s.teamName, count: s.open })
            : t("matches.requestToJoinSolo", { count: s.open })}
        </Button>
      ))}
    </div>
  )
}
