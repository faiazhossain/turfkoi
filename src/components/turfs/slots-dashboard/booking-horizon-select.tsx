"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Loader } from "@/components/ui/loader"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/i18n/client"

import { updateBookingHorizonAction } from "@/features/turfs/actions"
import { BOOKING_HORIZON_CHOICES } from "@/features/turfs/schemas"

/**
 * Per-turf booking window (Slots dashboard): how far ahead players can book.
 * Saves immediately on change — extending fills slots further ahead,
 * shrinking trims unbooked ones past the new horizon. The select is disabled
 * with an inline approved Loader while saving; failures revert + toast.
 */
export function BookingHorizonSelect({
  turfId,
  defaultDays,
}: {
  turfId: string
  defaultDays: number
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [days, setDays] = useState(defaultDays)
  const [pending, setPending] = useState(false)

  async function onChange(next: string) {
    const nextDays = Number(next)
    if (nextDays === days || pending) return
    const prev = days
    setDays(nextDays)
    setPending(true)
    try {
      const res = await updateBookingHorizonAction(turfId, nextDays)
      if (!res.ok) {
        setDays(prev)
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      const m = res.materialized
      toast.success(
        m
          ? t("turfOwner.schedule.windowSavedWithSlots", {
              days: nextDays,
              added: m.inserted,
              removed: m.deleted,
            })
          : t("turfOwner.schedule.windowSaved", { days: nextDays })
      )
      router.refresh()
    } catch {
      setDays(prev)
      toast.error(t("turfOwner.schedule.windowSaveFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {pending ? (
          <Loader size={16} label={t("turfOwner.schedule.saving")} />
        ) : null}
        <span className="text-sm font-medium">
          {t("turfOwner.schedule.bookingWindow")}
        </span>
      </div>
      <Select
        value={String(days)}
        onValueChange={(v) => void onChange(v ?? String(days))}
      >
        <SelectTrigger
          size="sm"
          className="w-40"
          disabled={pending}
          aria-busy={pending}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOOKING_HORIZON_CHOICES.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {t("turfOwner.schedule.daysAhead", { count: d })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">
        {t("turfOwner.schedule.windowHint", { count: days })}
      </p>
    </div>
  )
}
