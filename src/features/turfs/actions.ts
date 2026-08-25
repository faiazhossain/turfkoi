"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, ne } from "drizzle-orm"

import { db } from "@/db"
import { isUniqueViolation, pgConstraintName } from "@/db/errors"
import {
  turfs,
  turfSlots,
  turfSchedules,
  turfScheduleSections,
  turfDateExceptions,
} from "@/db/schema"
import { can } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"
import {
  addDays,
  rangesOverlap,
  spillOverlap,
  todayInDhaka,
} from "@/lib/slot-expansion"

import {
  activateScheduleSchema,
  addSlotSchema,
  clearDateExceptionSchema,
  dateExceptionSchema,
  generateSlotsSchema,
  saveScheduleSchema,
  slotOverrideSchema,
  turfFormSchema,
  type ActivateScheduleValues,
  type AddSlotValues,
  type DateExceptionValues,
  type GenerateSlotsValues,
  type SaveScheduleValues,
  type SlotOverrideValues,
  type TurfFormValues,
} from "./schemas"
import { materializeTurfSchedule } from "./materialize"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "You are not signed in." }
}

function forbidden(): ActionResult {
  return { ok: false, error: "You don't have permission to do that." }
}

export async function createTurfAction(
  input: TurfFormValues
): Promise<ActionResult> {
  const parsed = turfFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!can(user, "turf.update", { ownerId: user.id })) return forbidden()

  const { coords, ...rest } = parsed.data
  try {
    const [created] = await db
      .insert(turfs)
      .values({ ...rest, coords, ownerId: user.id })
      .returning({ id: turfs.id })
    revalidatePath("/turfs")
    revalidatePath("/turf-owner")
    return { ok: true, id: created.id }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "That slug is already taken." }
    }
    throw err
  }
}

export async function updateTurfAction(
  turfId: string,
  input: TurfFormValues
): Promise<ActionResult> {
  const parsed = turfFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const { coords, ...rest } = parsed.data
  await db
    .update(turfs)
    .set({ ...rest, coords, updatedAt: new Date() })
    .where(eq(turfs.id, turfId))
  revalidatePath("/turfs")
  revalidatePath(`/turfs/${parsed.data.slug}`)
  revalidatePath("/turf-owner")
  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true, id: turfId }
}

/**
 * Bulk materialize turf_slots from a generate form. Iterates the date range
 * × selected weekdays × consecutive slot windows. `onConflictDoNothing` on
 * the composite PK dedupes re-runs.
 */
export async function generateSlotsAction(
  turfId: string,
  input: GenerateSlotsValues
): Promise<ActionResult & { inserted?: number }> {
  const parsed = generateSlotsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const { dateFrom, dateTo, weekdays, startTime, durationMinutes, slotsPerDay, basePrice } =
    parsed.data
  const weekdaySet = new Set(weekdays)
  const [fy, fm, fd] = dateFrom.split("-").map(Number)
  const [ty, tm, td] = dateTo.split("-").map(Number)
  const cursor = new Date(Date.UTC(fy!, fm! - 1, fd!))
  const end = new Date(Date.UTC(ty!, tm! - 1, td!))

  const [startH, startM] = startTime.split(":").map(Number)
  const rows: Array<{
    turfId: string
    date: string
    startTime: string
    durationMinutes: number
    price: string
  }> = []

  // Iterate calendar days; emit a slot for each weekday match.
  for (let d = new Date(cursor); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!weekdaySet.has(d.getUTCDay())) continue
    const dateStr = d.toISOString().slice(0, 10)
    let minutesOfDay = startH! * 60 + startM!
    for (let i = 0; i < slotsPerDay; i++) {
      const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, "0")
      const mm = String(minutesOfDay % 60).padStart(2, "0")
      rows.push({
        turfId,
        date: dateStr,
        startTime: `${hh}:${mm}`,
        durationMinutes,
        price: basePrice.toFixed(2),
      })
      minutesOfDay += durationMinutes
      if (minutesOfDay >= 24 * 60) break
    }
  }

  if (rows.length === 0) {
    return { ok: false, error: "No slots fall in that range." }
  }

  await db
    .insert(turfSlots)
    .values(rows)
    .onConflictDoNothing()
  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true, inserted: rows.length }
}

export async function updateSlotAction(
  turfId: string,
  date: string,
  startTime: string,
  input: SlotOverrideValues
): Promise<ActionResult> {
  const parsed = slotOverrideSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.price !== undefined) {
    patch.price = parsed.data.price.toFixed(2)
  }
  if (parsed.data.status !== undefined) {
    // Owners can't manually flip a booked slot — booking state is owned by the
    // booking lifecycle (Phase 3). Only maintenance/block/available allowed.
    if (parsed.data.status === "booked" || parsed.data.status === "held") {
      return {
        ok: false,
        error: "Can't set that status manually — it's controlled by bookings.",
      }
    }
    patch.status = parsed.data.status
  }
  if (Object.keys(patch).length === 0) return { ok: true }
  // Any owner touch promotes the row to manual so schedule regeneration
  // never overwrites it (single-slot touch > schedule precedence).
  patch.source = "manual"

  await db
    .update(turfSlots)
    .set(patch)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        eq(turfSlots.date, date),
        eq(turfSlots.startTime, startTime)
      )
    )
  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true }
}

/** Owners may only delete slots that are not (and have never been) booked. */
export async function deleteSlotAction(
  turfId: string,
  date: string,
  startTime: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }
  await db
    .delete(turfSlots)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        eq(turfSlots.date, date),
        eq(turfSlots.startTime, startTime),
        eq(turfSlots.status, "available")
      )
    )
  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true }
}

export type ScheduleMaterializeSummary = {
  inserted: number
  updated: number
  deleted: number
  conflicts: string[]
}

export type SaveScheduleResult =
  | { ok: true; scheduleId?: string; materialized?: ScheduleMaterializeSummary }
  | { ok: false; error: string }

/**
 * Slot system P1: create or edit a weekly schedule (sections with duration,
 * gap, and price per section). Saving an active schedule immediately
 * materializes the next 30 days; the materializer's WHERE guards mean a
 * booking landing mid-save makes its statement a no-op, never a corruption.
 */
export async function saveScheduleAction(
  turfId: string,
  input: SaveScheduleValues
): Promise<SaveScheduleResult> {
  const parsed = saveScheduleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const { scheduleId, name, isActive, sections } = parsed.data
  try {
    // Deactivate siblings FIRST — the partial unique index allows exactly
    // one active schedule per turf.
    if (isActive) {
      await db
        .update(turfSchedules)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          scheduleId
            ? and(
                eq(turfSchedules.turfId, turfId),
                ne(turfSchedules.id, scheduleId)
              )
            : eq(turfSchedules.turfId, turfId)
        )
    }

    let rowId = scheduleId
    if (scheduleId) {
      const updated = await db
        .update(turfSchedules)
        .set({ name, isActive, updatedAt: new Date() })
        .where(
          and(eq(turfSchedules.id, scheduleId), eq(turfSchedules.turfId, turfId))
        )
        .returning({ id: turfSchedules.id })
      if (updated.length === 0) {
        return { ok: false, error: "Schedule not found." }
      }
      // Sections are rewritten wholesale — they are pure schedule state.
      await db
        .delete(turfScheduleSections)
        .where(eq(turfScheduleSections.scheduleId, scheduleId))
    } else {
      const [created] = await db
        .insert(turfSchedules)
        .values({ turfId, name, isActive })
        .returning({ id: turfSchedules.id })
      rowId = created!.id
    }

    await db.insert(turfScheduleSections).values(
      sections.map((s) => ({
        scheduleId: rowId!,
        dayOfWeek: s.dayOfWeek,
        label: s.label ?? null,
        startTime: s.startTime,
        endTime: s.endTime,
        slotMinutes: s.slotMinutes,
        gapMinutes: s.gapMinutes,
        price: s.price.toFixed(2),
      }))
    )

    let materialized: ScheduleMaterializeSummary | undefined
    if (isActive) {
      const res = await materializeTurfSchedule(turfId)
      materialized = {
        inserted: res.inserted,
        updated: res.updated,
        deleted: res.deleted,
        conflicts: res.conflicts,
      }
    }

    revalidatePath(`/turf-owner/turfs/${turfId}`)
    return { ok: true, scheduleId: rowId, materialized }
  } catch (err) {
    if (pgConstraintName(err) === "turf_schedules_one_active") {
      return {
        ok: false,
        error: "Another schedule just went active — retry in a moment.",
      }
    }
    throw err
  }
}

/**
 * Slot system P1: hand-place a single custom slot on one date (Layer 3 —
 * "add that timing"). Inserted as source=manual, so regeneration treats it
 * as untouchable. Overlap is checked across the adjacent days too, because a
 * 23:30/90 slot yesterday spills into today and vice versa.
 */
export async function addSlotAction(
  turfId: string,
  input: AddSlotValues
): Promise<ActionResult> {
  const parsed = addSlotSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const { date, startTime, durationMinutes, price } = parsed.data
  if (date < todayInDhaka()) {
    return { ok: false, error: "Pick today or a future date." }
  }

  const prevDate = addDays(date, -1)
  const nextDate = addDays(date, 1)
  const neighbors = await db
    .select({
      date: turfSlots.date,
      startTime: turfSlots.startTime,
      durationMinutes: turfSlots.durationMinutes,
    })
    .from(turfSlots)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        inArray(turfSlots.date, [prevDate, date, nextDate])
      )
    )

  for (const row of neighbors) {
    // Postgres time round-trips as HH:mm:ss; comparisons want HH:mm.
    const rowStart = row.startTime.slice(0, 5)
    const proposal = { startTime, durationMinutes }
    const rowRange = {
      startTime: rowStart,
      durationMinutes: row.durationMinutes,
    }
    const clashes = row.date === date
      ? rangesOverlap(startTime, durationMinutes, rowStart, row.durationMinutes)
      : row.date === prevDate
        ? spillOverlap(proposal, rowRange, "previous")
        : spillOverlap(proposal, rowRange, "next")
    if (clashes) {
      return {
        ok: false,
        error: `Overlaps the ${rowStart} slot on ${row.date}.`,
      }
    }
  }

  const inserted = await db
    .insert(turfSlots)
    .values({
      turfId,
      date,
      startTime,
      durationMinutes,
      price: price.toFixed(2),
      status: "available",
      source: "manual",
    })
    .onConflictDoNothing()
    .returning({ startTime: turfSlots.startTime })
  if (inserted.length === 0) {
    return { ok: false, error: `A slot already starts at ${startTime} on that date.` }
  }

  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true }
}

/**
 * Slot system P2: set (or replace) a date exception — close a date, or apply
 * a holiday price rule. Re-runs materialization so the change lands
 * immediately: closing drops that date's available template slots (bookings
 * stay and surface as conflicts for the owner to work out), a price rule
 * reprices available template rows. Manual slots keep their hand-set price.
 */
export async function setDateExceptionAction(
  turfId: string,
  input: DateExceptionValues
): Promise<ActionResult> {
  const parsed = dateExceptionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const { date, isClosed, reason, priceMode, priceValue } = parsed.data
  if (date < todayInDhaka()) {
    return { ok: false, error: "Pick today or a future date." }
  }

  await db
    .insert(turfDateExceptions)
    .values({
      turfId,
      date,
      isClosed,
      reason: reason?.trim() ? reason.trim() : null,
      priceMode: isClosed ? null : (priceMode ?? null),
      priceValue: isClosed ? null : priceValue != null ? priceValue.toFixed(2) : null,
    })
    .onConflictDoUpdate({
      target: [turfDateExceptions.turfId, turfDateExceptions.date],
      set: {
        isClosed,
        reason: reason?.trim() ? reason.trim() : null,
        priceMode: isClosed ? null : (priceMode ?? null),
        priceValue: isClosed ? null : priceValue != null ? priceValue.toFixed(2) : null,
        updatedAt: new Date(),
      },
    })

  await materializeTurfSchedule(turfId)
  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true }
}

/** Remove a date exception and restore the plain weekly schedule for it. */
export async function clearDateExceptionAction(
  turfId: string,
  input: { date: string }
): Promise<ActionResult> {
  const parsed = clearDateExceptionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  await db
    .delete(turfDateExceptions)
    .where(
      and(
        eq(turfDateExceptions.turfId, turfId),
        eq(turfDateExceptions.date, parsed.data.date)
      )
    )

  await materializeTurfSchedule(turfId)
  revalidatePath(`/turf-owner/turfs/${turfId}`)
  return { ok: true }
}

/**
 * Slot system P3.1: activate a saved schedule, optionally for an effective
 * window (the seasonal-switch mechanism — "Ramadan hours, Feb 19 - Mar 20",
 * then back to "Regular week" after Eid). Deactivates the previously active
 * schedule and rematerializes so the new week's slots land immediately.
 * Booked/manual slots are untouched by the switch (the materializer's
 * safety contract); conflicts surface to the owner.
 */
export async function activateScheduleAction(
  turfId: string,
  input: ActivateScheduleValues
): Promise<SaveScheduleResult> {
  const parsed = activateScheduleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "Turf not found." }
  if (!can(user, "turf.update", { ownerId: existing[0].ownerId })) {
    return forbidden()
  }

  const { scheduleId, effectiveFrom, effectiveTo } = parsed.data
  try {
    // Deactivate every schedule for this turf, then activate the target.
    await db
      .update(turfSchedules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(turfSchedules.turfId, turfId))

    const updated = await db
      .update(turfSchedules)
      .set({
        isActive: true,
        effectiveFrom: effectiveFrom ?? null,
        effectiveTo: effectiveTo ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(turfSchedules.id, scheduleId), eq(turfSchedules.turfId, turfId))
      )
      .returning({ id: turfSchedules.id })
    if (updated.length === 0) {
      return { ok: false, error: "Schedule not found." }
    }

    const res = await materializeTurfSchedule(turfId)
    revalidatePath(`/turf-owner/turfs/${turfId}`)
    return {
      ok: true,
      scheduleId,
      materialized: {
        inserted: res.inserted,
        updated: res.updated,
        deleted: res.deleted,
        conflicts: res.conflicts,
      },
    }
  } catch (err) {
    if (pgConstraintName(err) === "turf_schedules_one_active") {
      return {
        ok: false,
        error: "Another schedule just went active — retry in a moment.",
      }
    }
    throw err
  }
}
