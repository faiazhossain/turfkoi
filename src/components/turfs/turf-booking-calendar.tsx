"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { bn as bnLocale } from "date-fns/locale"
import { CalendarCheckIcon } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useHoldSlot } from "@/components/bookings/use-hold-slot"
import { updateSlotAction } from "@/features/turfs/actions"
import { useI18n } from "@/i18n/client"
import { formatSlotDate } from "@/lib/format-date"
import { formatSlotTime, formatSlotTimeRange } from "@/lib/format-time"
import { formatBdt } from "@/lib/pricing"
import { toMinutes } from "@/lib/slot-expansion"
import type { BookingDay, DayStatus, PublicSlot } from "@/features/turfs/booking-calendar"

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  // Local (not UTC) construction: day-picker renders in the viewer's zone,
  // and BD players are the viewers (fixed UTC+6, no DST).
  return new Date(y!, m! - 1, d!)
}

function dateToIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Whether a slot is running at minute m of its day (spill-safe: no wrap). */
function slotCovers(slot: PublicSlot, m: number): boolean {
  const start = toMinutes(slot.startTime)
  return m >= start && m < start + slot.durationMinutes
}

/**
 * Player-facing booking calendar on the public turf page. Days are colored
 * by availability (green = open slots, red = fully booked, struck = closed);
 * clicking a day opens a centered dialog with that day's slots and Book
 * buttons. Month navigation is server-driven via ?month= so statuses are
 * always the real state, never a stale client copy.
 */
export function TurfBookingCalendar({
  turfId,
  slug,
  month,
  today,
  horizonEnd,
  days,
  isOwner = false,
}: {
  turfId: string
  slug: string
  /** Displayed month as YYYY-MM. */
  month: string
  /** Today in Asia/Dhaka (YYYY-MM-DD). */
  today: string
  /** Last bookable date (YYYY-MM-DD) from the turf's booking horizon. */
  horizonEnd: string
  days: Record<string, BookingDay>
  /** Viewer owns this turf: booking is replaced by block/unblock controls. */
  isOwner?: boolean
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState("")
  const { hold, pending, isBusy } = useHoldSlot(turfId)

  // Owner mode: block a slot (mark it unavailable) or open it back up.
  // Treated as a manual touch server-side, so regeneration never overwrites.
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  function setSlotStatus(slot: PublicSlot, status: "available" | "blocked") {
    const key = `${slot.date}|${slot.startTime}`
    setSavingKey(key)
    startSaving(async () => {
      const res = await updateSlotAction(turfId, slot.date, slot.startTime, {
        status,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        setSavingKey(null)
        return
      }
      router.refresh()
      setSavingKey(null)
    })
  }

  const filterMinutes = timeFilter ? toMinutes(timeFilter) : null

  /** Distinct slot start times of the displayed month — the owner's real
   * schedule, so players pick from times that actually exist. */
  const startTimes = useMemo(
    () =>
      [...new Set(Object.values(days).flatMap((d) => d.slots.map((s) => s.startTime)))].sort(),
    [days]
  )

  /**
   * With a time filter active, day colors answer "is THAT time free?":
   * green = a slot covering the time is available, red = covering slots
   * exist but all taken, uncolored = no slot covers the time. Closed/past/
   * outside days keep their own look. Recomputed locally — the page already
   * shipped every slot of the month.
   */
  const effectiveDays = useMemo(() => {
    if (filterMinutes === null) return days
    const out: Record<string, BookingDay> = {}
    for (const [iso, day] of Object.entries(days)) {
      if (day.status === "closed" || day.status === "past" || day.status === "outside") {
        out[iso] = day
        continue
      }
      const covering = day.slots.filter((s) => slotCovers(s, filterMinutes))
      out[iso] = {
        ...day,
        status:
          covering.length === 0
            ? "empty"
            : covering.some((s) => s.status === "available")
              ? "open"
              : "full",
      }
    }
    return out
  }, [days, filterMinutes])

  const entries = Object.entries(effectiveDays)
  const datesWhere = (status: DayStatus): Date[] =>
    entries
      .filter(([, day]) => day.status === status)
      .map(([iso]) => isoToDate(iso))

  const hasBookable = entries.some(
    ([, day]) => day.status === "open" || day.status === "full"
  )

  const day = openDate ? days[openDate] : undefined
  const openSlots = day?.slots ?? []
  const availableCount = openSlots.filter((s) => s.status === "available").length

  return (
    <div className="space-y-3">
      {startTimes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="slot-time-filter" className="text-xs font-medium text-muted-foreground">
            {t("turfs.timeFilterLabel")}
          </label>
          <Select
            value={timeFilter === "" ? "all" : timeFilter}
            onValueChange={(v) => setTimeFilter(v === "all" ? "" : v ?? "")}
            items={[
              { value: "all", label: t("turfs.timeFilterAll") },
              ...startTimes.map((time) => ({
                value: time,
                label: formatSlotTime(time, locale),
              })),
            ]}
          >
            <SelectTrigger id="slot-time-filter" size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("turfs.timeFilterAll")}</SelectItem>
              {startTimes.map((time) => (
                <SelectItem key={time} value={time}>
                  {formatSlotTime(time, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
        <Calendar
          locale={locale === "bn" ? bnLocale : undefined}
          showOutsideDays={false}
          month={isoToDate(`${month}-01`)}
          startMonth={isoToDate(today)}
          endMonth={isoToDate(horizonEnd)}
          onDayClick={(date) => {
            const iso = dateToIso(date)
            if (days[iso]) setOpenDate(iso)
          }}
          onMonthChange={(m) => {
            setOpenDate(null)
            router.push(`/turfs/${slug}?month=${dateToIso(m).slice(0, 7)}`, {
              scroll: false,
            })
          }}
          modifiers={{
            open: datesWhere("open"),
            full: datesWhere("full"),
            closed: datesWhere("closed"),
            disabled: [...datesWhere("past"), ...datesWhere("outside")],
          }}
          modifiersClassNames={{
            open: "bg-success/15 text-success ring-1 ring-success/40 hover:bg-success/25",
            full: "bg-destructive/15 text-destructive hover:bg-destructive/25",
            closed: "text-muted-foreground line-through hover:bg-muted/50",
          }}
          className="mx-auto w-full max-w-xl bg-transparent text-sm sm:text-base"
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-success/70 ring-1 ring-success/40" aria-hidden />
          {t("turfs.legendAvailable")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/70 ring-1 ring-destructive/40" aria-hidden />
          {t("turfs.legendFull")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-muted-foreground" aria-hidden />
          {t("turfs.legendClosed")}
        </span>
      </div>

      {!hasBookable ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarCheckIcon className="size-4" aria-hidden />
          {t("turfs.monthUnavailable")}
        </p>
      ) : null}

      <Dialog
        open={openDate !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDate(null)
        }}
      >
        <DialogContent className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {openDate ? t("turfs.slotsOn", { date: formatSlotDate(openDate, locale) }) : ""}
            </DialogTitle>
            <DialogDescription>
              {day?.status === "closed"
                ? [
                    t("turfs.dayClosed"),
                    day.closedReason ? `— ${day.closedReason}` : "",
                  ].join(" ")
                : isOwner
                  ? t("turfs.ownerNotice")
                  : openSlots.length > 0
                    ? t("turfs.slotAvailableCount", { count: availableCount })
                    : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {openSlots.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("turfs.dayNoSlots")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {openSlots.map((slot) => (
                  <SlotRow
                    key={slot.startTime}
                    slot={slot}
                    pending={pending}
                    busy={isBusy(slot.date, slot.startTime)}
                    matchesFilter={
                      filterMinutes !== null && slotCovers(slot, filterMinutes)
                    }
                    onBook={() => hold(slot)}
                    ownerControls={
                      isOwner
                        ? {
                            saving:
                              saving && savingKey === `${slot.date}|${slot.startTime}`,
                            onToggle: () =>
                              setSlotStatus(
                                slot,
                                slot.status === "available" ? "blocked" : "available"
                              ),
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SlotRow({
  slot,
  pending,
  busy,
  matchesFilter,
  onBook,
  ownerControls,
}: {
  slot: PublicSlot
  pending: boolean
  busy: boolean
  matchesFilter: boolean
  onBook: () => void
  /** Present when the viewer owns the turf — replaces the Book button. */
  ownerControls?: { saving: boolean; onToggle: () => void }
}) {
  const { t, locale } = useI18n()
  const bookable = slot.status === "available"
  const unblockable = slot.status === "blocked" || slot.status === "maintenance"

  return (
    <li
      className={
        matchesFilter
          ? "flex items-center justify-between gap-3 rounded-lg bg-primary/10 px-2 py-3 ring-1 ring-primary/40"
          : "flex items-center justify-between gap-3 px-2 py-3"
      }
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">
          {formatSlotTimeRange(slot.startTime, slot.endTime, locale)}
          <span className="ml-2 text-xs text-muted-foreground">
            {slot.durationMinutes}m
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {slot.label ? (
            <span className="rounded border border-border bg-muted px-1.5 py-0.5">
              {slot.label}
            </span>
          ) : null}
          {bookable ? null : (
            <span
              className={
                slot.status === "booked"
                  ? "rounded bg-destructive/15 px-1.5 py-0.5 text-destructive"
                  : "rounded bg-muted px-1.5 py-0.5"
              }
            >
              {slot.status === "booked"
                ? t("turfs.slotBooked")
                : slot.status === "held"
                  ? t("turfs.slotHeld")
                  : t("turfs.slotBlocked")}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm tabular-nums text-foreground">
          {formatBdt(slot.price)}
        </span>
        {ownerControls ? (
          bookable ? (
            <Button
              size="sm"
              variant="outline"
              loading={ownerControls.saving}
              onClick={ownerControls.onToggle}
            >
              {t("turfs.slotBlock")}
            </Button>
          ) : unblockable ? (
            <Button
              size="sm"
              variant="outline"
              className="border-success bg-success/10 text-success hover:bg-success/20 hover:text-success"
              loading={ownerControls.saving}
              onClick={ownerControls.onToggle}
            >
              {t("turfs.slotUnblock")}
            </Button>
          ) : null
        ) : bookable ? (
          <Button size="sm" onClick={onBook} loading={pending}>
            {busy ? t("turfs.holding") : t("turfs.book")}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
