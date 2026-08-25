"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { turfs, turfSlots } from "@/db/schema"
import { can } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"

import {
  generateSlotsSchema,
  slotOverrideSchema,
  turfFormSchema,
  type GenerateSlotsValues,
  type SlotOverrideValues,
  type TurfFormValues,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}

function forbidden(): ActionResult {
  return { ok: false, error: "errors.noPermission" }
}

export async function createTurfAction(
  input: TurfFormValues
): Promise<ActionResult> {
  const parsed = turfFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
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
    if (String(err).includes("unique")) {
      return { ok: false, error: "turfs.errors.slugTaken" }
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "turfs.errors.turfNotFound" }
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "turfs.errors.turfNotFound" }
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
    return { ok: false, error: "turfOwner.errors.noSlotsInRange" }
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const existing = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!existing[0]) return { ok: false, error: "turfs.errors.turfNotFound" }
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
        error: "turfOwner.errors.manualStatus",
      }
    }
    patch.status = parsed.data.status
  }
  if (Object.keys(patch).length === 0) return { ok: true }

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
  if (!existing[0]) return { ok: false, error: "turfs.errors.turfNotFound" }
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
