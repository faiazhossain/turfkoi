"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"

import { generateSlotsAction } from "@/features/turfs/actions"
import {
  generateSlotsSchema,
  type GenerateSlotsValues,
} from "@/features/turfs/schemas"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function GenerateSlotsForm({ turfId }: { turfId: string }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const form = useForm<GenerateSlotsValues>({
    resolver: zodResolver(generateSlotsSchema),
    defaultValues: {
      dateFrom: new Date().toISOString().slice(0, 10),
      dateTo: new Date(Date.now() + 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      weekdays: [1, 2, 3, 4, 5, 6],
      startTime: "18:00",
      durationMinutes: 60,
      slotsPerDay: 4,
      basePrice: 1500,
    },
  })

  async function onSubmit(values: GenerateSlotsValues) {
    setServerError(null)
    setInfo(null)
    const res = await generateSlotsAction(turfId, values)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    setInfo(`Generated ${res.inserted ?? 0} slots.`)
    router.refresh()
  }

  const watchedWeekdays = form.watch("weekdays")

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Start date
          </Label>
          <Input type="date" {...form.register("dateFrom")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            End date
          </Label>
          <Input type="date" {...form.register("dateTo")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Days of week</Label>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((label, idx) => {
            const checked = watchedWeekdays.includes(idx)
            return (
              <label
                key={label}
                className="flex items-center gap-1.5 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const set = new Set(watchedWeekdays)
                    if (v === true) set.add(idx)
                    else set.delete(idx)
                    form.setValue("weekdays", Array.from(set).sort(), {
                      shouldValidate: true,
                    })
                  }}
                />
                {label}
              </label>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            First slot
          </Label>
          <Input type="time" {...form.register("startTime")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Duration
          </Label>
          <Select
            value={String(form.watch("durationMinutes"))}
            onValueChange={(v) =>
              form.setValue("durationMinutes", Number(v) as 60 | 90, {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="60">60 min</SelectItem>
              <SelectItem value="90">90 min</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Slots per day
          </Label>
          <Input
            type="number"
            min={1}
            max={24}
            {...form.register("slotsPerDay", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Base price (BDT)
          </Label>
          <Input
            type="number"
            step="any"
            min={1}
            {...form.register("basePrice", { valueAsNumber: true })}
          />
          {form.formState.errors.basePrice?.message ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.basePrice.message}
            </p>
          ) : null}
        </div>
      </div>

      {serverError ? (
        <StatusBadge status="danger">{serverError}</StatusBadge>
      ) : null}
      {info ? <StatusBadge status="success">{info}</StatusBadge> : null}

      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden />
            Generating
          </>
        ) : (
          "Generate slots"
        )}
      </Button>
    </form>
  )
}
