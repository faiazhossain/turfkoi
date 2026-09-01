"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { StatusBadge } from "@/components/shared"
import { DayExceptionForm, type ExistingException } from "@/components/turfs/day-exception-form"
import { SlotGrid } from "@/components/turfs/slot-grid"
import { useI18n } from "@/i18n/client"
import { humanDateLocale } from "@/lib/format-date"

import { AddSlotSheet } from "./add-slot-sheet"

type DaySlot = {
  date: string
  startTime: string
  durationMinutes: number
  status: "available" | "held" | "booked" | "maintenance" | "blocked"
  price: string
}

/**
 * True after mount when the viewport is phone-sized. Until then the panel
 * renders the inline (desktop) card only — it is CSS-hidden on mobile, so
 * SSR and first client render match; the bottom sheet mounts right after.
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isMobile
}

/**
 * Selected-day editor (slots dashboard). Desktop: inline card in the right
 * column. Mobile: bottom sheet that opens whenever a date is selected —
 * state stays server-driven (?date=), closing just drops the param.
 */
export function DayPanel({
  turfId,
  month,
  selectedDate,
  holiday,
  exception,
  isRamadan,
  weekdayHasSections,
  daySlots,
}: {
  turfId: string
  month: string
  selectedDate: string
  holiday: { name: string; approximate?: boolean } | null
  exception: ExistingException | null
  isRamadan: boolean
  weekdayHasSections: boolean
  daySlots: DaySlot[]
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const isMobile = useIsMobile()

  const slotsSection =
    daySlots.length > 0 ? (
      <SlotGrid turfId={turfId} slots={daySlots} />
    ) : exception?.isClosed ? (
      <p className="rounded-lg border border-dashed border-dt-line p-4 text-center text-sm text-dt-dim">
        {t("turfOwner.schedule.dayClosedReopen")}
      </p>
    ) : weekdayHasSections ? (
      <p className="rounded-lg border border-dashed border-dt-line p-4 text-center text-sm text-dt-dim">
        {t("turfOwner.schedule.noSlotsThisDate")}
      </p>
    ) : (
      <p className="rounded-lg border border-dashed border-dt-line p-4 text-center text-sm text-dt-dim">
        {t("turfOwner.schedule.noSlotsThisWeekday")}
      </p>
    )

  const body = (
    <>
      <CardDescription className="space-x-2">
        {holiday ? (
          <StatusBadge status="warning" showIcon={false}>
            {holiday.name}
            {holiday.approximate ? t("turfOwner.schedule.holidayEstimate") : ""}
          </StatusBadge>
        ) : null}
        {exception?.isClosed ? (
          <StatusBadge status="danger" showIcon={false}>
            {exception.reason
              ? t("turfOwner.schedule.closedWithReason", { reason: exception.reason })
              : t("turfOwner.schedule.closed")}
          </StatusBadge>
        ) : null}
        {exception?.priceMode ? (
          <StatusBadge status="success" showIcon={false}>
            {exception.priceMode === "multiplier"
              ? t("turfOwner.schedule.multiplierRate", { value: exception.priceValue ?? 0 })
              : t("turfOwner.schedule.flatRate", { value: exception.priceValue ?? 0 })}
          </StatusBadge>
        ) : null}
        {isRamadan ? (
          <StatusBadge status="neutral" showIcon={false}>
            {t("turfOwner.schedule.ramadanHint")}
          </StatusBadge>
        ) : null}
      </CardDescription>
      <div className="space-y-6">
        <DayExceptionForm
          turfId={turfId}
          date={selectedDate}
          existing={exception}
          holidayName={holiday?.name ?? null}
        />
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            {t("turfOwner.schedule.slotsThisDay")}
          </h4>
          {slotsSection}
        </div>
        <AddSlotSheet turfId={turfId} date={selectedDate} />
      </div>
    </>
  )

  const [y, m, d] = selectedDate.split("-").map(Number)
  const heading = new Intl.DateTimeFormat(humanDateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y!, m! - 1, d!))

  return (
    <>
      {/* Desktop: inline card in the right column. */}
      <Card id="day-panel" className="hidden lg:block">
        <CardHeader>
          <CardTitle className="font-heading text-lg">{heading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{body}</CardContent>
      </Card>

      {/* Mobile: bottom sheet driven by the ?date= param. */}
      {isMobile ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) {
              router.push(`/turf-owner/turfs/${turfId}?month=${month}`, {
                scroll: false,
              })
            }
          }}
        >
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="font-heading text-lg">
                {heading}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">{body}</div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  )
}
