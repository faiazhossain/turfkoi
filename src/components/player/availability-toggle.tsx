"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ZapIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { toggleAvailabilityAction } from "@/features/player/actions"

export function AvailabilityToggle({ available }: { available: boolean }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await toggleAvailabilityAction()
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(
        res.available ? t("player.availableToastOn") : t("player.availableToastOff")
      )
      router.refresh()
    })
  }

  return (
    <Button
      variant={available ? "default" : "outline"}
      onClick={toggle}
      loading={pending}
      className="w-full"
    >
      <ZapIcon aria-hidden />
      {available ? t("player.availableOn") : t("player.availableOff")}
    </Button>
  )
}
