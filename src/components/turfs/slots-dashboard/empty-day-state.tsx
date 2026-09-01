"use client"

import { CalendarDaysIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"

/**
 * Right-column placeholder when no date is selected (desktop only — mobile
 * reaches the day panel through the calendar sheet).
 */
export function EmptyDayState() {
  const { t } = useI18n()
  return (
    <div className="hidden flex-col items-center gap-1.5 rounded-xl border border-dashed border-dt-line px-4 py-8 text-center text-sm text-dt-dim lg:flex">
      <CalendarDaysIcon className="size-4" aria-hidden />
      <span>{t("turfOwner.schedule.emptyDay")}</span>
    </div>
  )
}
