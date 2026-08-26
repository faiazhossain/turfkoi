"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { holdSlotAction } from "@/features/bookings/actions"

interface Slot {
  date: string
  startTime: string
  durationMinutes: number
  status: string
  price: string
  /** Owner's section label ("Evening", "Ramadan nights"), when set. */
  label?: string | null
}

export interface ClosedDay {
  date: string
  reason: string | null
}

/**
 * Slot picker on the public turf detail page. Calls holdSlotAction and, on
 * success, navigates to the booking detail page where the booker pays.
 * Closed dates in the window render explicitly (with the owner's reason)
 * instead of vanishing - players see "Closed - Eid-ul-Fitr", not an empty
 * void.
 */
export function BookSlotButton({
  turfId,
  slots,
  closedDays = [],
}: {
  turfId: string
  slots: Slot[]
  closedDays?: ClosedDay[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<string | null>(null)

  const available = slots.filter((s) => s.status === "available")
  if (available.length === 0 && closedDays.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("turfs.noBookable")}</p>
    )
  }

  // Merge slot rows and closed-date rows in date order so closures appear
  // where the day would have been. Slot list stays capped; closed rows are
  // few and always shown.
  type Row =
    | { kind: "slot"; slot: Slot }
    | { kind: "closed"; day: ClosedDay }
  const shown = available.slice(0, 12)
  const rows: Row[] = []
  let closedIdx = 0
  for (const slot of shown) {
    while (
      closedIdx < closedDays.length &&
      closedDays[closedIdx]!.date <= slot.date
    ) {
      rows.push({ kind: "closed", day: closedDays[closedIdx]! })
      closedIdx++
    }
    rows.push({ kind: "slot", slot })
  }
  while (closedIdx < closedDays.length) {
    rows.push({ kind: "closed", day: closedDays[closedIdx]! })
    closedIdx++
  }

  function book(slot: Slot) {
    setSelected(`${slot.date}|${slot.startTime}`)
    start(async () => {
      const res = await holdSlotAction({
        turfId,
        date: slot.date,
        startTime: slot.startTime,
      })
      if (!res.ok || !res.bookingId) {
        toast.error(!res.ok ? t(res.error ?? "errors.generic") : t("turfs.holdFailed"))
        setSelected(null)
        return
      }
      router.push(`/bookings/${res.bookingId}`)
    })
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {rows.map((row, i) => {
        if (row.kind === "closed") {
          return (
            <li
              key={`closed-${row.day.date}-${i}`}
              className="flex items-center justify-between gap-2 bg-muted/50 p-3 text-sm text-muted-foreground"
            >
              <span className="font-mono text-xs">{row.day.date}</span>
              <span>
                Closed{row.day.reason ? ` — ${row.day.reason}` : ""}
              </span>
            </li>
          )
        }
        const s = row.slot
        const key = `${s.date}|${s.startTime}`
        const busy = pending && selected === key
        return (
          <li
            key={key}
            className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
          >
            <span className="flex items-center gap-2 font-mono text-xs">
              {s.date} · {s.startTime.slice(0, 5)} ({s.durationMinutes}m)
              {s.label ? (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] text-foreground">
                  {s.label}
                </span>
              ) : null}
            </span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                ৳{Number(s.price).toLocaleString()}
              </span>
              <Button
                size="sm"
                onClick={() => book(s)}
                loading={pending}
              >
                {busy ? t("turfs.holding") : t("turfs.book")}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
