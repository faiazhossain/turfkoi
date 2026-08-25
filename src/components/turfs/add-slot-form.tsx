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

import { addSlotAction } from "@/features/turfs/actions"
import { addSlotSchema, type AddSlotValues } from "@/features/turfs/schemas"

const DURATIONS = [30, 45, 60, 75, 90, 120, 180]

/**
 * Hand-place one custom slot on a specific date (slot system P1). When opened
 * from a day in the calendar, `defaultDate` prefills (and hides) the date
 * field; `onSuccess` lets the hosting sheet close after the add.
 */
export function AddSlotForm({
  turfId,
  defaultDate,
  onSuccess,
}: {
  turfId: string
  defaultDate?: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const form = useForm<AddSlotValues>({
    resolver: zodResolver(addSlotSchema),
    defaultValues: {
      date: defaultDate ?? new Date().toISOString().slice(0, 10),
      startTime: "21:00",
      durationMinutes: 60,
      price: 1500,
    },
  })

  async function onSubmit(values: AddSlotValues) {
    setServerError(null)
    setInfo(null)
    const res = await addSlotAction(turfId, values)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    setInfo(`Custom slot added for ${values.date} at ${values.startTime}.`)
    router.refresh()
    onSuccess?.()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Date</Label>
          {defaultDate ? (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              {defaultDate}
            </p>
          ) : (
            <Input type="date" {...form.register("date")} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Start time
          </Label>
          <Input type="time" {...form.register("startTime")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Duration
          </Label>
          <Select
            value={String(form.watch("durationMinutes"))}
            onValueChange={(v) =>
              form.setValue("durationMinutes", Number(v), {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Price (BDT)
          </Label>
          <Input
            type="number"
            step="any"
            min={1}
            {...form.register("price", { valueAsNumber: true })}
          />
          {form.formState.errors.price?.message ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.price.message}
            </p>
          ) : null}
        </div>
      </div>

      {serverError ? (
        <StatusBadge status="danger">{serverError}</StatusBadge>
      ) : null}
      {info ? <StatusBadge status="success">{info}</StatusBadge> : null}

      <Button
        type="submit"
        size="lg"
        loading={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Adding" : "Add custom slot"}
      </Button>
    </form>
  )
}
