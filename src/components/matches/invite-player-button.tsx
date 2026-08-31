"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UserPlusIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import { Button } from "@/components/ui/button"
import { inviteMatchPlayersAction } from "@/features/matches/actions"

/**
 * Per-row invite button for the "players available nearby" list. Each row
 * owns its transition so N rows never share one spinner. Creates a pending
 * invitation — the player must accept; it consumes a squad spot until
 * answered.
 */
export function InvitePlayerButton({
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

  function invite() {
    start(async () => {
      const res = await inviteMatchPlayersAction({ matchId, userIds: [playerId] })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.invite.sentToast", { name: playerName }))
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={invite}
      disabled={disabled || pending}
      loading={pending}
      aria-label={t("matches.invite.aria", { name: playerName })}
    >
      <UserPlusIcon aria-hidden />
      {t("matches.invite.cta")}
    </Button>
  )
}
