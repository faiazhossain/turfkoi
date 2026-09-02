"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { InfoIcon, ZapIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/i18n/client"
import { toggleAvailabilityAction } from "@/features/player/actions"
import { cn } from "@/lib/utils"

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
    <div>
      <div className="flex items-center gap-2">
        <Button
          variant={available ? "default" : "outline"}
          onClick={toggle}
          loading={pending}
          className={cn(
            "flex-1 cursor-pointer transition-transform active:scale-95",
            available ? "player-live" : "match-btn-outline"
          )}
        >
          {available ? <span className="match-blink-dot" aria-hidden /> : null}
          <ZapIcon aria-hidden />
          {available ? t("player.liveOnline") : t("player.liveOff")}
        </Button>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("player.availabilityInfoLabel")}
              />
            }
          >
            <InfoIcon className="size-4 text-dt-dim" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <PopoverDescription>
              {t("player.availabilityInfo")}
            </PopoverDescription>
          </PopoverContent>
        </Popover>
      </div>
      <p className="mt-1.5 text-center text-xs text-dt-dim">
        {t("player.liveHint")}
      </p>
      <p className="mt-2 text-center text-xs text-dt-dim">
        {t(available ? "player.soloHintOn" : "player.soloHintOff")}
      </p>
    </div>
  )
}
