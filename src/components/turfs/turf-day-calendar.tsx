"use client"

import { useRouter } from "next/navigation"
import { bn as bnLocale } from "date-fns/locale"

import { Calendar } from "@/components/ui/calendar"
import { useI18n } from "@/i18n/client"

export type DayMarker = {
  closed?: boolean
  priceRule?: boolean
  holiday?: boolean
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  // Local (not UTC) construction: day-picker renders in the viewer's zone,
  // and BD owners are the viewers (fixed UTC+6, no DST).
  return new Date(y!, m! - 1, d!)
}

function dateToIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Owner-facing month calendar (slot system P2). Days carry markers for
 * closures, price rules, and seeded holidays; clicking a day opens its slot
 * panel via the ?date= search param. Month navigation is server-driven via
 * ?month=, so markers are always the real state, never a stale client copy.
 */
export function TurfDayCalendar({
  turfId,
  month,
  selectedDate,
  markers,
}: {
  turfId: string
  /** Any date within the month to display. */
  month: string
  selectedDate: string | null
  markers: Record<string, DayMarker>
}) {
  const router = useRouter()
  const { t, locale } = useI18n()

  const datesWhere = (pred: (m: DayMarker) => boolean): Date[] =>
    Object.entries(markers)
      .filter(([, marker]) => pred(marker))
      .map(([date]) => isoToDate(date))

  function push(next: { date?: string; month: string }) {
    const params = new URLSearchParams()
    params.set("month", next.month)
    if (next.date) params.set("date", next.date)
    router.push(`/turf-owner/turfs/${turfId}?${params.toString()}#day-panel`, {
      scroll: false,
    })
  }

  return (
    <div className="space-y-3">
      <Calendar
        mode="single"
        locale={locale === "bn" ? bnLocale : undefined}
        month={isoToDate(`${month}-01`)}
        selected={selectedDate ? isoToDate(selectedDate) : undefined}
        onSelect={(date) => {
          if (date) {
            push({ date: dateToIso(date), month: month })
          }
        }}
        onMonthChange={(m) => {
          push({ month: dateToIso(m).slice(0, 7) })
        }}
        modifiers={{
          closed: datesWhere((m) => !!m.closed),
          priceRule: datesWhere((m) => !!m.priceRule),
          holiday: datesWhere((m) => !!m.holiday),
        }}
        modifiersClassNames={{
          closed:
            "bg-destructive/15 text-destructive line-through hover:bg-destructive/25",
          priceRule: "bg-primary/10 ring-1 ring-primary/50",
          holiday: "ring-1 ring-muted-foreground/50",
        }}
      />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/60" aria-hidden />
          {t("turfOwner.schedule.legendClosed")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary/60" aria-hidden />
          {t("turfOwner.schedule.legendSpecialPrice")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-muted-foreground" aria-hidden />
          {t("turfOwner.schedule.legendPublicHoliday")}
        </span>
      </div>
    </div>
  )
}
