"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { holdSlotAction } from "@/features/bookings/actions"

interface Slot {
  date: string
  startTime: string
  durationMinutes: number
  status: string
  price: string
}

/**
 * Slot picker on the public turf detail page. Calls holdSlotAction and, on
 * success, navigates to the booking detail page where the booker pays.
 */
export function BookSlotButton({ turfId, slots }: { turfId: string; slots: Slot[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<string | null>(null)

  const available = slots.filter((s) => s.status === "available")
  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bookable slots right now — check back later.
      </p>
    )
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
        toast.error(!res.ok ? res.error : "Couldn't hold that slot.")
        setSelected(null)
        return
      }
      router.push(`/bookings/${res.bookingId}`)
    })
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {available.slice(0, 12).map((s) => {
        const key = `${s.date}|${s.startTime}`
        const busy = pending && selected === key
        return (
          <li
            key={key}
            className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
          >
            <span className="font-mono text-xs">
              {s.date} · {s.startTime.slice(0, 5)} ({s.durationMinutes}m)
            </span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                ৳{Number(s.price).toLocaleString()}
              </span>
              <Button
                size="sm"
                onClick={() => book(s)}
                disabled={pending}
              >
                {busy ? "Holding…" : "Book"}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
