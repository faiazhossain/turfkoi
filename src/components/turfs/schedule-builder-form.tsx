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
import { useI18n } from "@/i18n/client"

import { saveScheduleAction } from "@/features/turfs/actions"
import {
  saveScheduleSchema,
  type SaveScheduleValues,
} from "@/features/turfs/schemas"
import {
  expandSectionsForDay,
  findSectionConflicts,
} from "@/lib/slot-expansion"
import type { PlanConflict } from "@/lib/slot-planning"

const DURATIONS = [30, 45, 60, 75, 90, 120, 180]
const GAPS = [0, 5, 10, 15, 20, 30]

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
  const { t } = useI18n()
  const [selectedDay, setSelectedDay] = useState(1)
  const [copyTarget, setCopyTarget] = useState("0")
  const [serverError, setServerError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<PlanConflict[]>([])

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
        t("turfOwner.schedule.savedMaterialized", {
          added: m.inserted,
          updated: m.updated,
          removed: m.deleted,
        })
      )
      setConflicts(m.conflicts)
    } else {
      setSummary(t("turfOwner.schedule.savedInactive"))
    }
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("turfOwner.schedule.scheduleName")}
          </Label>
          <Input {...form.register("name")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("turfOwner.schedule.status")}
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
              <SelectItem value="active">
                {t("turfOwner.schedule.statusActive")}
              </SelectItem>
              <SelectItem value="inactive">
                {t("turfOwner.schedule.statusInactive")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-dt-dim">
          {t("turfOwner.schedule.editingDay")}
        </Label>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={selectedDay === day}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (selectedDay === day
                  ? "border-dt-green bg-dt-green text-dt-ink"
                  : "border-dt-line bg-dt-card text-dt-txt hover:bg-dt-card2")
              }
            >
              {t(`turfOwner.generate.day${day}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {daySections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-dt-line p-4 text-center text-sm text-dt-dim">
            {t("turfOwner.schedule.noSectionsThatDay", {
              day: t(`turfOwner.generate.day${selectedDay}`),
            })}
          </p>
        ) : null}

        {fields
          .map((field, idx) => ({ field, idx }))
          .filter(({ idx }) => sections[idx]?.dayOfWeek === selectedDay)
          .map(({ field, idx }) => {
            return (
              <div
                key={field.id}
                className="space-y-2 rounded-lg border border-dt-line bg-dt-card p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder={t("turfOwner.schedule.labelPlaceholder")}
                    className="h-8 max-w-48"
                    {...form.register(`sections.${idx}.label` as const)}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("turfOwner.schedule.removeSection")}
                    onClick={() => remove(idx)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="space-y-1">
                    <Label className="text-xs text-dt-dim">
                      {t("turfOwner.schedule.from")}
                    </Label>
                    <Input
                      type="time"
                      {...form.register(`sections.${idx}.startTime` as const)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-dt-dim">
                      {t("turfOwner.schedule.to")}
                    </Label>
                    <Input
                      type="time"
                      {...form.register(`sections.${idx}.endTime` as const)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-dt-dim">
                      {t("turfOwner.schedule.slotLabel")}
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
                            {t("turfOwner.generate.minutes", { count: d })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-dt-dim">
                      {t("turfOwner.schedule.gapLabel")}
                    </Label>
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
                            {g === 0
                              ? t("turfOwner.wizard.gapNone")
                              : t("turfOwner.wizard.gapMinutes", { count: g })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-dt-dim">
                      {t("turfOwner.generate.basePrice")}
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
          {t("turfOwner.schedule.addSectionOn", {
            day: t(`turfOwner.generate.day${selectedDay}`),
          })}
        </Button>
        <div className="flex items-center gap-1 text-sm text-dt-dim">
          {t("turfOwner.schedule.copyDayTo", {
            day: t(`turfOwner.generate.day${selectedDay}`),
          })}
          <Select
            value={copyTarget}
            onValueChange={(v) => setCopyTarget(v ?? "0")}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4, 5, 6].map((day) =>
                day === selectedDay ? null : (
                  <SelectItem key={day} value={String(day)}>
                    {t(`turfOwner.generate.day${day}`)}
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
            {t("turfOwner.schedule.copy")}
          </Button>
        </div>
      </div>

      {preview.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-dt-dim">
            {t("turfOwner.schedule.previewCount", {
              day: t(`turfOwner.generate.day${selectedDay}`),
              count: preview.length,
            })}
          </p>
          <div className="flex flex-wrap gap-1">
            {preview.map((p, i) => (
              <span
                key={`${p.startTime}-${i}`}
                className="rounded border border-dt-line bg-dt-card2 px-1.5 py-0.5 font-mono text-xs"
              >
                {p.startTime}
                <span className="ml-1 text-dt-dim">
                  {p.durationMinutes}m
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {conflictList.length > 0 ? (
        <div className="space-y-1">
          {conflictList.map((c, i) => (
            <p key={i} className="text-xs text-destructive">
              {t(
                c.type === "overlap"
                  ? "turfOwner.schedule.conflictOverlap"
                  : "turfOwner.schedule.conflictWrap",
                {
                  a: `${t(`turfOwner.generate.day${c.a.dayOfWeek}`)} ${c.a.range}`,
                  b: `${t(`turfOwner.generate.day${c.b.dayOfWeek}`)} ${c.b.range}`,
                }
              )}
            </p>
          ))}
        </div>
      ) : null}

      {form.formState.errors.sections?.message ? (
        <StatusBadge status="danger">
          {t(String(form.formState.errors.sections.message))}
        </StatusBadge>
      ) : null}
      {serverError ? (
        <StatusBadge status="danger">{t(serverError)}</StatusBadge>
      ) : null}
      {summary ? <StatusBadge status="success">{summary}</StatusBadge> : null}
      {conflicts.length > 0 ? (
        <div className="rounded-lg border border-warning bg-warning/10 p-3 text-xs text-dt-txt">
          <p className="mb-1 font-medium">
            {t("turfOwner.schedule.leftInPlace")}
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {conflicts.map((c, i) => (
              <li key={i}>
                <span className="font-mono">
                  {c.date} · {c.startTime}
                </span>{" "}
                {t(`turfOwner.schedule.conflictKind.${c.kind}`)}
                {c.kind === "kept_duration" && c.gotMinutes != null && c.wantMinutes != null
                  ? ` — ${t("turfOwner.schedule.conflictMinutes", {
                      got: c.gotMinutes,
                      want: c.wantMinutes,
                    })}`
                  : ""}
              </li>
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
        {form.formState.isSubmitting
          ? t("turfOwner.wizard.saving")
          : t("turfOwner.schedule.saveSchedule")}
      </Button>
    </form>
  )
}
