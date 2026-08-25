"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { requestToJoinAction } from "@/features/player/actions"

interface TeamSpot {
  teamId: string
  teamName: string
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

  function join(teamName: string) {
    start(async () => {
      const res = await requestToJoinAction(matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.requestedJoin", { team: teamName }))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {spots.map((s) => (
        <Button
          key={s.teamId}
          size="sm"
          variant="outline"
          onClick={() => join(s.teamName)}
          loading={pending}
        >
          {t("matches.requestToJoin", { team: s.teamName, count: s.open })}
        </Button>
      ))}
    </div>
  )
}
