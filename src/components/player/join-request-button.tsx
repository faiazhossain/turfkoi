"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { requestToJoinAction } from "@/features/player/actions"

/** One join request per player — the accepting captain seats them on their
 * own side, so the player doesn't pick one. */
export function JoinRequestButton({
  matchId,
  spots,
}: {
  matchId: string
  /** Total open seats across joinable sides. */
  spots: number
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  if (spots <= 0) return null

  function join() {
    start(async () => {
      const res = await requestToJoinAction(matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.requestedJoinSolo"))
      router.refresh()
    })
  }

  return (
    <Button size="sm" variant="outline" onClick={join} loading={pending}>
      {t("matches.requestToJoinSolo", { count: spots })}
    </Button>
  )
}
