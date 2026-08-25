import "server-only"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  turfDateExceptions,
  turfScheduleSections,
  turfSchedules,
  turfSlots,
} from "@/db/schema"
import {
  addDays,
  expandScheduleRange,
  todayInDhaka,
  type DayRule,
  type PriceOverride,
  type ScheduleSection,
} from "@/lib/slot-expansion"
import {
  planMaterialization,
  type ExistingSlotRow,
} from "@/lib/slot-planning"

/** How far ahead the nightly job keeps inventory materialized. */
export const SCHEDULE_HORIZON_DAYS = 30

// Chunk size for multi-row inserts (Neon HTTP parameter limits are generous,
// but a 7-day Ramadan schedule can produce 300+ rows per run).
const INSERT_CHUNK = 200

export type ActiveSchedule = {
  id: string
  name: string
  sections: ScheduleSection[]
}

export type SavedSchedule = {
  id: string
  name: string
  isActive: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  sectionCount: number
}

/**
 * All schedules for a turf, newest first. Powers the saved-schedule library
 * (P3.1) — the owner keeps "Regular week" and "Ramadan hours" side by side
 * and switches between them.
 */
export async function listSchedules(turfId: string): Promise<SavedSchedule[]> {
  const rows = await db
    .select({
      id: turfSchedules.id,
      name: turfSchedules.name,
      isActive: turfSchedules.isActive,
      effectiveFrom: turfSchedules.effectiveFrom,
      effectiveTo: turfSchedules.effectiveTo,
      sectionCount: sql<number>`count(${turfScheduleSections.id})::int`,
    })
    .from(turfSchedules)
    .leftJoin(turfScheduleSections, eq(turfScheduleSections.scheduleId, turfSchedules.id))
    .where(eq(turfSchedules.turfId, turfId))
    .groupBy(turfSchedules.id)
    .orderBy(desc(turfSchedules.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    sectionCount: r.sectionCount,
  }))
}

export type DateException = {
  date: string
  isClosed: boolean
  reason: string | null
  priceMode: "multiplier" | "absolute" | null
  priceValue: number | null
}

/** Exception rows for a date window, ascending. */
export async function listDateExceptions(
  turfId: string,
  range: { from: string; to: string }
): Promise<DateException[]> {
  const rows = await db
    .select()
    .from(turfDateExceptions)
    .where(
      and(
        eq(turfDateExceptions.turfId, turfId),
        gte(turfDateExceptions.date, range.from),
        lte(turfDateExceptions.date, range.to)
      )
    )
    .orderBy(turfDateExceptions.date)
  return rows.map((r) => ({
    date: r.date,
    isClosed: r.isClosed,
    reason: r.reason,
    priceMode: r.priceMode,
    priceValue: r.priceValue == null ? null : Number(r.priceValue),
  }))
}

function toDayRules(exceptions: DateException[]): Map<string, DayRule> {
  const rules = new Map<string, DayRule>()
  for (const ex of exceptions) {
    const override: PriceOverride =
      ex.priceMode && ex.priceValue != null
        ? { mode: ex.priceMode, value: ex.priceValue }
        : null
    rules.set(ex.date, { closed: ex.isClosed, override })
  }
  return rules
}

export async function getActiveSchedule(
  turfId: string
): Promise<ActiveSchedule | null> {
  const [schedule] = await db
    .select()
    .from(turfSchedules)
    .where(and(eq(turfSchedules.turfId, turfId), eq(turfSchedules.isActive, true)))
    .limit(1)
  if (!schedule) return null

  // Seasonal switch support (P2/P3 UI): an active schedule outside its
  // effective window materializes nothing. P1 nothing sets these yet.
  const today = todayInDhaka()
  if (schedule.effectiveFrom && schedule.effectiveFrom > today) return null
  if (schedule.effectiveTo && schedule.effectiveTo < today) return null

  const rows = await db
    .select()
    .from(turfScheduleSections)
    .where(eq(turfScheduleSections.scheduleId, schedule.id))

  const sections: ScheduleSection[] = rows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    label: r.label,
    startTime: r.startTime,
    endTime: r.endTime,
    slotMinutes: r.slotMinutes,
    gapMinutes: r.gapMinutes,
    price: Number(r.price),
  }))
  return { id: schedule.id, name: schedule.name, sections }
}

export type MaterializeResult = {
  applied: boolean
  inserted: number
  updated: number
  deleted: number
  conflicts: string[]
  keptManual: number
}

/**
 * Reconcile materialized turf_slots with the turf's active weekly schedule
 * over [from, to]. The plan is computed by the pure planner; application is
 * a strict deletes -> updates -> inserts sequence where every mutating
 * statement re-asserts (status = available AND source = template) in its
 * WHERE clause — the Neon HTTP driver offers no multi-statement transactions,
 * so a booking landing mid-run turns the affected statement into a no-op
 * instead of corrupting state.
 */
export async function materializeTurfSchedule(
  turfId: string,
  range?: { from: string; to: string }
): Promise<MaterializeResult> {
  const active = await getActiveSchedule(turfId)
  if (!active) {
    return {
      applied: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      conflicts: [],
      keptManual: 0,
    }
  }

  const from = range?.from ?? todayInDhaka()
  const to = range?.to ?? addDays(from, SCHEDULE_HORIZON_DAYS)
  // One day past `to`: the last date's wrapping sections spill into it,
  // and a closed exception there must suppress that spillover.
  const exceptions = await listDateExceptions(turfId, {
    from,
    to: addDays(to, 1),
  })
  const desired = expandScheduleRange(
    active.sections,
    from,
    to,
    toDayRules(exceptions)
  )

  // One day past `to`: the last date's wrapping sections spill into it.
  const existing = await db
    .select()
    .from(turfSlots)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        gte(turfSlots.date, from),
        lte(turfSlots.date, addDays(to, 1))
      )
    )

  const existingRows: ExistingSlotRow[] = existing.map((r) => ({
    date: r.date,
    startTime: r.startTime,
    durationMinutes: r.durationMinutes,
    price: Number(r.price),
    status: r.status,
    source: r.source,
  }))
  const plan = planMaterialization(existingRows, desired)

  for (const d of plan.deletes) {
    await db
      .delete(turfSlots)
      .where(
        and(
          eq(turfSlots.turfId, turfId),
          eq(turfSlots.date, d.date),
          eq(turfSlots.startTime, d.startTime),
          eq(turfSlots.status, "available"),
          eq(turfSlots.source, "template")
        )
      )
  }

  for (const u of plan.updates) {
    await db
      .update(turfSlots)
      .set({
        durationMinutes: u.durationMinutes,
        price: u.price.toFixed(2),
        scheduleId: active.id,
      })
      .where(
        and(
          eq(turfSlots.turfId, turfId),
          eq(turfSlots.date, u.date),
          eq(turfSlots.startTime, u.startTime),
          eq(turfSlots.status, "available"),
          eq(turfSlots.source, "template")
        )
      )
  }

  for (let i = 0; i < plan.inserts.length; i += INSERT_CHUNK) {
    const chunk = plan.inserts.slice(i, i + INSERT_CHUNK)
    await db
      .insert(turfSlots)
      .values(
        chunk.map((s) => ({
          turfId,
          date: s.date,
          startTime: s.startTime,
          durationMinutes: s.durationMinutes,
          price: s.price.toFixed(2),
          status: "available" as const,
          source: "template" as const,
          scheduleId: active.id,
        }))
      )
      .onConflictDoNothing()
  }

  return {
    applied: true,
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    deleted: plan.deletes.length,
    conflicts: plan.conflicts,
    keptManual: plan.keptManual,
  }
}

export type SlotConflict = {
  date: string
  startTime: string
  durationMinutes: number
  kind: "booked_outside_plan" | "booked_duration_mismatch" | "kept_manual"
  detail: string
}

/**
 * Needs-attention center (P3.2): slots the materializer refuses to touch
 * because a booking or the owner's hand work sits where the active schedule
 * no longer agrees. These are surfaced to the owner rather than forced —
 * the booking lifecycle owns booked rows, manual rows outrank the schedule.
 */
export async function listSlotConflicts(turfId: string): Promise<SlotConflict[]> {
  const active = await getActiveSchedule(turfId)
  if (!active) return []

  const from = todayInDhaka()
  const to = addDays(from, SCHEDULE_HORIZON_DAYS)
  const desired = expandScheduleRange(active.sections, from, to)
  const desiredKeys = new Set(
    desired.map((d) => `${d.date}|${d.startTime}`)
  )

  const rows = await db
    .select()
    .from(turfSlots)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        gte(turfSlots.date, from),
        lte(turfSlots.date, to)
      )
    )

  const conflicts: SlotConflict[] = []
  for (const row of rows) {
    const key = `${row.date}|${row.startTime.slice(0, 5)}`
    const inPlan = desiredKeys.has(key)
    if (row.source === "manual") {
      if (!inPlan || row.durationMinutes !== desired.find((d) => `${d.date}|${d.startTime}` === key)?.durationMinutes) {
        conflicts.push({
          date: row.date,
          startTime: row.startTime.slice(0, 5),
          durationMinutes: row.durationMinutes,
          kind: "kept_manual",
          detail: "Custom slot - regeneration never touches it",
        })
      }
      continue
    }
    if (row.status === "booked" || row.status === "held") {
      if (!inPlan) {
        conflicts.push({
          date: row.date,
          startTime: row.startTime.slice(0, 5),
          durationMinutes: row.durationMinutes,
          kind: "booked_outside_plan",
          detail: "Active booking sits outside the new schedule",
        })
      } else {
        const want = desired.find((d) => `${d.date}|${d.startTime}` === key)
        if (want && want.durationMinutes !== row.durationMinutes) {
          conflicts.push({
            date: row.date,
            startTime: row.startTime.slice(0, 5),
            durationMinutes: row.durationMinutes,
            kind: "booked_duration_mismatch",
            detail: `Booked ${row.durationMinutes} min but the schedule now wants ${want.durationMinutes} min`,
          })
        }
      }
    }
  }
  return conflicts.sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
  )
}
