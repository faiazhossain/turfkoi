"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, Trash2Icon } from "lucide-react"

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

import { saveScheduleAction } from "@/features/turfs/actions"
import {
  saveScheduleSchema,
  type SaveScheduleValues,
} from "@/features/turfs/schemas"
import {
  DAY_NAMES,
  expandSectionsForDay,
  findSectionConflicts,
} from "@/lib/slot-expansion"

const DURATIONS = [30, 45, 60, 75, 90, 120, 180]
const GAPS = [0, 5, 10, 15, 20, 30]
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * Weekly schedule builder (slot system P2). Sections are edited per selected
 * weekday; the live preview recomputes the exact slot starts client-side
 * with the same pure expander the server materializes from, so what the
 * owner previews is what players get.
 */
export function ScheduleBuilderForm({
  turfId,
  defaultValues,
}: {
  turfId: string
  defaultValues: SaveScheduleValues
}) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState(1)
  const [copyTarget, setCopyTarget] = useState("0")
  const [serverError, setServerError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])

  const form = useForm<SaveScheduleValues>({
    resolver: zodResolver(saveScheduleSchema),
    defaultValues,
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "sections",
  })

  const sections = form.watch("sections")
  const daySections = sections.filter((s) => s.dayOfWeek === selectedDay)

  const dayCounts = useMemo(() => {
    const counts = new Array(7).fill(0) as number[]
    for (const s of sections) counts[s.dayOfWeek] = (counts[s.dayOfWeek] ?? 0) + 1
    return counts
  }, [sections])

  // Preview + conflict signal recompute as the owner types.
  const preview = useMemo(
    () => expandSectionsForDay(sections, selectedDay),
    [sections, selectedDay]
  )
  const conflictList = useMemo(() => findSectionConflicts(sections), [sections])

  function addSection() {
    append({
      dayOfWeek: selectedDay,
      label: undefined,
      startTime: "17:00",
      endTime: "23:00",
      slotMinutes: 90,
      gapMinutes: 10,
      price: 1200,
    })
  }

  function copyDayTo(target: number) {
    if (target === selectedDay) return
    const kept = sections.filter((s) => s.dayOfWeek !== target)
    const copies = daySections.map((s) => ({ ...s, dayOfWeek: target }))
    replace([...kept, ...copies])
  }

  async function onSubmit(values: SaveScheduleValues) {
    setServerError(null)
    setSummary(null)
    setConflicts([])
    const res = await saveScheduleAction(turfId, values)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    const m = res.materialized
    if (m) {
      setSummary(
        `Saved. Materialized next 30 days: ${m.inserted} added, ${m.updated} updated, ${m.deleted} removed.`
      )
      setConflicts(m.conflicts)
    } else {
      setSummary("Saved (inactive - activate to materialize).")
    }
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Schedule name
          </Label>
          <Input {...form.register("name")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Status
          </Label>
          <Select
            value={form.watch("isActive") ? "active" : "inactive"}
            onValueChange={(v) =>
              form.setValue("isActive", v === "active", { shouldValidate: true })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active - runs every week</SelectItem>
              <SelectItem value="inactive">Saved for later</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Editing day
        </Label>
        <div className="flex flex-wrap gap-2">
          {DAY_ABBR.map((abbr, day) => (
            <button
              key={abbr}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={selectedDay === day}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (selectedDay === day
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted")
              }
            >
              {abbr}
              <span className="ml-1 text-xs opacity-70">
                {dayCounts[day] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {daySections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {DAY_NAMES[selectedDay]} has no sections - the turf is closed that
            day.
          </p>
        ) : null}

        {fields
          .map((field, idx) => ({ field, idx }))
          .filter(({ idx }) => sections[idx]?.dayOfWeek === selectedDay)
          .map(({ field, idx }) => {
            return (
              <div
                key={field.id}
                className="space-y-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder="Label (e.g. Evening)"
                    className="h-8 max-w-48"
                    {...form.register(`sections.${idx}.label` as const)}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove section"
                    onClick={() => remove(idx)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="time"
                      {...form.register(`sections.${idx}.startTime` as const)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      To
                    </Label>
                    <Input
                      type="time"
                      {...form.register(`sections.${idx}.endTime` as const)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Slot
                    </Label>
                    <Select
                      value={String(sections[idx]?.slotMinutes ?? 60)}
                      onValueChange={(v) =>
                        form.setValue(
                          `sections.${idx}.slotMinutes` as const,
                          Number(v),
                          { shouldValidate: true }
                        )
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
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Gap</Label>
                    <Select
                      value={String(sections[idx]?.gapMinutes ?? 0)}
                      onValueChange={(v) =>
                        form.setValue(
                          `sections.${idx}.gapMinutes` as const,
                          Number(v),
                          { shouldValidate: true }
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GAPS.map((g) => (
                          <SelectItem key={g} value={String(g)}>
                            {g === 0 ? "none" : `+${g} min`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Price (BDT)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`sections.${idx}.price` as const, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addSection}>
          <PlusIcon aria-hidden />
          Add section on {DAY_ABBR[selectedDay]}
        </Button>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          Copy {DAY_ABBR[selectedDay]} to
          <Select
            value={copyTarget}
            onValueChange={(v) => setCopyTarget(v ?? "0")}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_ABBR.map((abbr, day) =>
                day === selectedDay ? null : (
                  <SelectItem key={abbr} value={String(day)}>
                    {abbr}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => copyDayTo(Number(copyTarget))}
            disabled={daySections.length === 0}
          >
            Copy
          </Button>
        </div>
      </div>

      {preview.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {DAY_NAMES[selectedDay]} preview - {preview.length} slots
          </p>
          <div className="flex flex-wrap gap-1">
            {preview.map((p, i) => (
              <span
                key={`${p.startTime}-${i}`}
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
              >
                {p.startTime}
                <span className="ml-1 text-muted-foreground">
                  {p.durationMinutes}m
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {conflictList.length > 0 ? (
        <div className="space-y-1">
          {conflictList.map((c) => (
            <p key={c} className="text-xs text-destructive">
              {c}
            </p>
          ))}
        </div>
      ) : null}

      {form.formState.errors.sections?.message ? (
        <StatusBadge status="danger">
          {String(form.formState.errors.sections.message)}
        </StatusBadge>
      ) : null}
      {serverError ? <StatusBadge status="danger">{serverError}</StatusBadge> : null}
      {summary ? <StatusBadge status="success">{summary}</StatusBadge> : null}
      {conflicts.length > 0 ? (
        <div className="rounded-lg border border-warning bg-warning/10 p-3 text-xs text-foreground">
          <p className="mb-1 font-medium">
            Left in place - resolve manually below:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        loading={form.formState.isSubmitting}
        disabled={conflictList.length > 0}
      >
        {form.formState.isSubmitting ? "Saving" : "Save schedule"}
      </Button>
    </form>
  )
}
