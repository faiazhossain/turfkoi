"use client"

import { CalendarDaysIcon } from "lucide-react"

/**
 * Right-column placeholder when no date is selected (desktop only — mobile
 * reaches the day panel through the calendar sheet).
 */
export function EmptyDayState() {
  return (
    <div className="hidden flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground lg:flex">
      <CalendarDaysIcon className="size-4" aria-hidden />
      <span>Select a day to see its slots, close it, or change its price.</span>
      <span lang="bn" className="text-xs">
        যেকোনো দিন নির্বাচন করুন — সেই দিনের স্লট দেখুন, বুকিং বন্ধ করুন বা দাম
        বদলান।
      </span>
    </div>
  )
}
