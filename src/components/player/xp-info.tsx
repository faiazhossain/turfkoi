"use client"

import { InfoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/i18n/client"

/** ⓘ next to the dashboard XP bar — explains how XP is earned. */
export function XpInfoButton() {
  const { t } = useI18n()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("player.xpInfoLabel")}
          />
        }
      >
        <InfoIcon className="size-3.5 text-dt-dim" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverDescription>{t("player.xpInfo")}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
