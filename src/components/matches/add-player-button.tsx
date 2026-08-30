"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UserPlusIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import { Button } from "@/components/ui/button"
import { addPlayerAction } from "@/features/matches/actions"

/**
 * Per-row add button for the "players available nearby" list. Each row owns
 * its transition so N rows never share one spinner; disabled once the roster
 * is full.
 */
export function AddPlayerButton({
  matchId,
  playerId,
  playerName,
  disabled,
}: {
  matchId: string
  playerId: string
  playerName: string
  disabled?: boolean
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  function add() {
    start(async () => {
      const res = await addPlayerAction({ matchId, playerId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.playerAdded"))
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={add}
      disabled={disabled || pending}
      loading={pending}
      aria-label={t("matches.addNearbyAria", { name: playerName })}
    >
      <UserPlusIcon aria-hidden />
      {t("common.add")}
    </Button>
  )
}
