"use client"

import { useState } from "react"
import { CalendarDaysIcon, ChevronDownIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * Collapsible home for day-by-day adjustments (calendar + day panel).
 * Collapsed by default — weekly hours is the primary path; owners open this
 * only when a specific date needs closing, a price override, or a one-off
 * slot.
 */
export function DayAdjustments({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <section className="space-y-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <CalendarDaysIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {t("turfOwner.schedule.dayAdjustmentsTitle")}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("turfOwner.schedule.dayAdjustmentsDesc")}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </button>
      {open ? <div className="space-y-6">{children}</div> : null}
    </section>
  )
}
