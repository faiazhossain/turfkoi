"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { confirmPlayedAction } from "@/features/player/actions"

export function ConfirmPlayedButton({ matchId }: { matchId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  function confirm() {
    start(async () => {
      const res = await confirmPlayedAction(matchId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("player.playedToast"))
      router.refresh()
    })
  }

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={confirm}
      loading={pending}
    >
      <CheckIcon aria-hidden />
      {t("player.playedLabel")}
    </Button>
  )
}
