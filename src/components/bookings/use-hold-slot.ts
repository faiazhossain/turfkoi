"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { holdSlotAction } from "@/features/bookings/actions"

/**
 * Hold-a-slot flow shared by booking surfaces: calls holdSlotAction, toasts
 * failures (cleared selection so the player can retry), and navigates to the
 * booking detail page on success. `isBusy(date, startTime)` drives the
 * per-button loading state while `pending` disables the rest.
 */
export function useHoldSlot(turfId: string) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<string | null>(null)

  function hold(slot: { date: string; startTime: string }) {
    const key = `${slot.date}|${slot.startTime}`
    setSelected(key)
    start(async () => {
      const res = await holdSlotAction({
        turfId,
        date: slot.date,
        startTime: slot.startTime,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        setSelected(null)
        return
      }
      if (!res.bookingId) {
        toast.error(t("errors.generic"))
        setSelected(null)
        return
      }
      router.push(`/bookings/${res.bookingId}`)
    })
  }

  return {
    hold,
    pending,
    isBusy: (date: string, startTime: string) =>
      pending && selected === `${date}|${startTime}`,
  }
}
