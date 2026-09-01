"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"

import {
  clearDateExceptionAction,
  setDateExceptionAction,
} from "@/features/turfs/actions"
import {
  dateExceptionSchema,
  type DateExceptionValues,
} from "@/features/turfs/schemas"

export type ExistingException = {
  isClosed: boolean
  reason: string | null
  priceMode: "multiplier" | "absolute" | null
  priceValue: number | null
}

/**
 * Day-exception editor (slot system P2): close a date or set its holiday
 * price rule. Saving rematerializes immediately — booked slots stay put and
 * surface as conflicts in the weekly-schedule card if they no longer fit.
 */
export function DayExceptionForm({
  turfId,
  date,
  existing,
  holidayName,
}: {
  turfId: string
  date: string
  existing: ExistingException | null
  holidayName: string | null
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"save" | "clear" | null>(null)

  const form = useForm<DateExceptionValues>({
    resolver: zodResolver(dateExceptionSchema),
    defaultValues: {
      date,
      isClosed: existing?.isClosed ?? false,
      reason: existing?.reason ?? holidayName ?? undefined,
      priceMode: existing?.priceMode ?? undefined,
      priceValue: existing?.priceValue ?? undefined,
    },
  })

  const isClosed = form.watch("isClosed")
  const priceMode = form.watch("priceMode")

  async function onSubmit(values: DateExceptionValues) {
    setServerError(null)
    setBusy("save")
    try {
      const res = await setDateExceptionAction(turfId, values)
      if (!res.ok) {
        setServerError(res.error)
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function onClear() {
    setServerError(null)
    setBusy("clear")
    try {
      const res = await clearDateExceptionAction(turfId, { date })
      if (!res.ok) {
        setServerError(res.error)
        return
      }
      form.reset({ date, isClosed: false, reason: undefined, priceMode: undefined, priceValue: undefined })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-dt-dim">
          {t("turfOwner.schedule.bookingStatusLabel")}
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={isClosed ? "outline" : "default"}
            disabled={busy !== null || !isClosed}
            onClick={() => {
              form.setValue("isClosed", false, { shouldValidate: true })
            }}
          >
            {t("turfOwner.schedule.statusOpen")}
          </Button>
          <Button
            type="button"
            variant={isClosed ? "destructive" : "outline"}
            disabled={busy !== null || isClosed}
            onClick={() => {
              form.setValue("isClosed", true, { shouldValidate: true })
              form.setValue("priceMode", undefined)
              form.setValue("priceValue", undefined)
            }}
          >
            {t("turfOwner.schedule.statusClosed")}
          </Button>
        </div>
        {isClosed ? (
          <p className="text-xs text-dt-dim">
            {t("turfOwner.schedule.statusClosedHint")}
          </p>
        ) : null}
      </div>

      {isClosed ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("turfOwner.schedule.reasonLabel")}
          </Label>
          <Input
            placeholder={holidayName ?? t("turfOwner.schedule.reasonPlaceholder")}
            {...form.register("reason")}
          />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("turfOwner.schedule.specialPrice")}
            </Label>
            <Select
              value={priceMode ?? "none"}
              onValueChange={(v) => {
                if (v === "none" || v === null) {
                  form.setValue("priceMode", undefined)
                  form.setValue("priceValue", undefined)
                } else {
                  form.setValue("priceMode", v as "multiplier" | "absolute", {
                    shouldValidate: true,
                  })
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("turfOwner.schedule.priceModeNone")}
                </SelectItem>
                <SelectItem value="multiplier">
                  {t("turfOwner.schedule.priceModeMultiplier")}
                </SelectItem>
                <SelectItem value="absolute">
                  {t("turfOwner.schedule.priceModeAbsolute")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {priceMode ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {priceMode === "multiplier"
                  ? t("turfOwner.schedule.multiplierLabel")
                  : t("turfOwner.schedule.flatPriceLabel")}
              </Label>
              <Input
                type="number"
                step="any"
                min={0}
                {...form.register("priceValue", { valueAsNumber: true })}
              />
              {form.formState.errors.priceValue?.message ? (
                <p className="text-xs text-destructive">
                  {t(String(form.formState.errors.priceValue.message))}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {form.formState.errors.isClosed?.message ? (
        <p className="text-xs text-destructive">
          {t(String(form.formState.errors.isClosed.message))}
        </p>
      ) : null}
      {serverError ? (
        <StatusBadge status="danger">{t(serverError)}</StatusBadge>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={busy === "save"} disabled={busy !== null}>
          {busy === "save"
            ? t("turfOwner.schedule.applying")
            : t("turfOwner.schedule.applyToDay")}
        </Button>
        {existing ? (
          <Button
            type="button"
            variant="outline"
            loading={busy === "clear"}
            disabled={busy !== null}
            onClick={onClear}
          >
            {busy === "clear"
              ? t("turfOwner.schedule.removing")
              : t("turfOwner.schedule.removeException")}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
