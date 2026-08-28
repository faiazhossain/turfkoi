"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import type { Locale } from "@/i18n/config"
import type { Translator } from "@/i18n/translate"

import { activateScheduleAction } from "@/features/turfs/actions"
import type { SavedSchedule } from "@/features/turfs/materialize"
import { nextRamadanWindow } from "@/lib/bd-holidays"
import { formatDateRange, formatDayMonthYear } from "@/lib/format-date"

type WindowDraft = { from: string; to: string }

function formatWindow(
  from: string | null,
  to: string | null,
  locale: Locale,
  t: Translator
): string {
  if (from && to) return formatDateRange(from, to, locale)
  if (from) {
    return t("turfOwner.schedule.windowFrom", {
      date: formatDayMonthYear(from, locale),
    })
  }
  if (to) {
    return t("turfOwner.schedule.windowUntil", {
      date: formatDayMonthYear(to, locale),
    })
  }
  return ""
}

/**
 * Saved-schedule library (slot system P3.4): the seasonal switch. Saved
 * schedules sit side by side - "Regular week" next to "Ramadan hours" - and
 * Activate swaps which one runs, rematerializing immediately. The optional
 * effective window is what makes the switch seasonal: outside its window a
 * schedule produces no slots at all (getActiveSchedule), so the owner sets
 * one for Ramadan via the seeded dates and switches back after Eid. Booked
 * and hand-edited slots are never touched by a switch (materializer safety
 * contract); leftover mismatches surface in the needs-attention card.
 */
export function SavedSchedulesCard({
  turfId,
  schedules,
  today,
}: {
  turfId: string
  schedules: SavedSchedule[]
  /** Dhaka today as YYYY-MM-DD, passed in so the card stays deterministic. */
  today: string
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [windows, setWindows] = useState<Record<string, WindowDraft>>({})

  const ramadan = nextRamadanWindow(today)

  if (schedules.length === 0) return null

  function setWindow(id: string, patch: Partial<WindowDraft>) {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { from: "", to: "" }), ...patch },
    }))
  }

  async function onActivate(schedule: SavedSchedule) {
    const draft = windows[schedule.id]
    setServerError(null)
    setSummary(null)
    setPendingId(schedule.id)
    try {
      const res = await activateScheduleAction(turfId, {
        scheduleId: schedule.id,
        effectiveFrom: draft?.from || null,
        effectiveTo: draft?.to || null,
      })
      if (!res.ok) {
        setServerError(res.error)
        return
      }
      const m = res.materialized
      setSummary(
        m
          ? t("turfOwner.schedule.activatedWithSlots", {
              name: schedule.name,
              added: m.inserted,
              updated: m.updated,
              removed: m.deleted,
              conflictsNote:
                m.conflicts.length > 0
                  ? t("turfOwner.schedule.activatedConflicts", {
                      count: m.conflicts.length,
                    })
                  : "",
            })
          : t("turfOwner.schedule.activated", { name: schedule.name })
      )
      router.refresh()
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {t("turfOwner.schedule.savedSchedules")}
        </CardTitle>
        <CardDescription>
          {ramadan
            ? t("turfOwner.schedule.savedDescRamadan", {
                window: formatWindow(ramadan.from, ramadan.to, locale, t),
              })
            : t("turfOwner.schedule.savedDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {schedules.map((s) => {
            const draft = windows[s.id]
            const busyElsewhere = pendingId !== null && pendingId !== s.id
            return (
              <li
                key={s.id}
                className="space-y-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("turfOwner.schedule.sectionCount", {
                        count: s.sectionCount,
                      })}
                      {s.effectiveFrom || s.effectiveTo
                        ? ` — ${t("turfOwner.schedule.windowLabel", {
                            window: formatWindow(
                              s.effectiveFrom,
                              s.effectiveTo,
                              locale,
                              t
                            ),
                          })}`
                        : ""}
                    </p>
                  </div>
                  {s.isActive ? (
                    <StatusBadge status="success" showIcon={false}>
                      {t("turfOwner.schedule.active")}
                    </StatusBadge>
                  ) : null}
                </div>

                {s.isActive && s.effectiveTo && s.effectiveTo < today ? (
                  <p className="text-xs text-warning">
                    {t("turfOwner.schedule.windowEnded")}
                  </p>
                ) : null}
                {s.isActive && s.effectiveFrom && s.effectiveFrom > today ? (
                  <p className="text-xs text-warning">
                    {t("turfOwner.schedule.windowStartsLater", {
                      date: s.effectiveFrom,
                    })}
                  </p>
                ) : null}

                {!s.isActive ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`from-${s.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("turfOwner.schedule.from")}
                      </Label>
                      <Input
                        id={`from-${s.id}`}
                        type="date"
                        className="h-8 w-38"
                        value={draft?.from ?? ""}
                        onChange={(e) =>
                          setWindow(s.id, { from: e.target.value })
                        }
                        disabled={pendingId !== null}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`to-${s.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("turfOwner.schedule.to")}
                      </Label>
                      <Input
                        id={`to-${s.id}`}
                        type="date"
                        className="h-8 w-38"
                        value={draft?.to ?? ""}
                        onChange={(e) => setWindow(s.id, { to: e.target.value })}
                        disabled={pendingId !== null}
                      />
                    </div>
                    {ramadan ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pendingId !== null}
                        onClick={() =>
                          setWindow(s.id, {
                            from: ramadan.from,
                            to: ramadan.to,
                          })
                        }
                      >
                        {t("turfOwner.schedule.ramadanDates")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      loading={pendingId === s.id}
                      disabled={busyElsewhere}
                      onClick={() => onActivate(s)}
                    >
                      {pendingId === s.id
                        ? t("turfOwner.schedule.activating")
                        : t("turfOwner.schedule.activate")}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        {serverError ? (
          <StatusBadge status="danger">{t(serverError)}</StatusBadge>
        ) : null}
        {summary ? <StatusBadge status="success">{summary}</StatusBadge> : null}
      </CardContent>
    </Card>
  )
}
