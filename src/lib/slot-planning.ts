/**
 * Slot materialization planning (P1) — the pure diff between "what the
 * schedule wants" and "what exists", before any database statement runs.
 *
 * The safety contract of the whole schedule system lives here:
 *
 *   - Only rows that are BOTH source=template AND status=available are ever
 *     mutated or deleted. Everything else is kept:
 *       booked/held   — booking lifecycle owns them (frozen slotEnd/times)
 *       manual        — owner's hand-added or hand-edited slots outrank the
 *                       schedule forever (single-slot touch > schedule)
 *       maintenance/  — owner signaling; never deleted under a regen
 *       blocked
 *   - Inserts and duration-changing updates are overlap-guarded against
 *     kept rows, so regeneration can never create a double-bookable window.
 *   - Rows the plan could not reconcile are reported as conflicts, never
 *     forced. Surfacing them in an owner-facing "needs attention" list is
 *     P3; the engine just refuses to touch them.
 */

import { rangesOverlap, toMinutes, type DatedSlotDraft } from "@/lib/slot-expansion"

export type SlotStatus =
  | "available"
  | "held"
  | "booked"
  | "maintenance"
  | "blocked"

export type ExistingSlotRow = {
  date: string
  startTime: string
  durationMinutes: number
  price: number
  status: SlotStatus
  source: "template" | "manual"
}

export type SlotMutation = {
  date: string
  startTime: string
  durationMinutes: number
  price: number
}

export type MaterializePlan = {
  /** New rows to insert (source=template). */
  inserts: SlotMutation[]
  /** Existing available template rows whose price/duration drifted. */
  updates: SlotMutation[]
  /** Available template rows the schedule no longer offers. */
  deletes: Array<{ date: string; startTime: string }>
  /** Human-readable notes the engine refused to resolve destructively. */
  conflicts: string[]
  /** Manual rows present in the window (never touched by this run). */
  keptManual: number
  /** Rows matching the plan exactly (no statement needed). */
  unchanged: number
}

/**
 * Postgres `time` round-trips as "HH:mm:ss"; the expansion lib works in
 * "HH:mm". Normalize both sides so map keys compare equal.
 */
export function normalizeHHMM(startTime: string): string {
  const sliced = startTime.slice(0, 5)
  // Reuse toMinutes as the validator; throws on anything unexpected.
  toMinutes(sliced)
  return sliced
}

function key(date: string, startTime: string): string {
  return `${date}|${startTime}`
}

/** Rows materialization must leave alone (everything but available+template). */
function isKept(row: ExistingSlotRow): boolean {
  return !(row.source === "template" && row.status === "available")
}

function describeKept(row: ExistingSlotRow): string {
  if (row.source === "manual") return "custom slot"
  if (row.status === "booked" || row.status === "held") return "active booking"
  return row.status
}

export function planMaterialization(
  existingRaw: ExistingSlotRow[],
  desiredRaw: DatedSlotDraft[]
): MaterializePlan {
  const existing = existingRaw.map((r) => ({
    ...r,
    startTime: normalizeHHMM(r.startTime),
  }))
  const desired = desiredRaw.map((d) => ({
    ...d,
    startTime: normalizeHHMM(d.startTime),
  }))

  const existingByKey = new Map(existing.map((r) => [key(r.date, r.startTime), r]))
  const desiredKeys = new Set(desired.map((d) => key(d.date, d.startTime)))

  // Overlap guards need, per date, the rows that will REMAIN after this run.
  const keptByDate = new Map<string, ExistingSlotRow[]>()
  for (const row of existing) {
    if (!isKept(row)) continue
    const arr = keptByDate.get(row.date) ?? []
    arr.push(row)
    keptByDate.set(row.date, arr)
  }

  const plan: MaterializePlan = {
    inserts: [],
    updates: [],
    deletes: [],
    conflicts: [],
    keptManual: 0,
    unchanged: 0,
  }

  const overlapsKept = (slot: { date: string; startTime: string; durationMinutes: number }, exceptKey?: string) => {
    const kept = keptByDate.get(slot.date) ?? []
    return kept.some(
      (row) =>
        key(row.date, row.startTime) !== exceptKey &&
        rangesOverlap(slot.startTime, slot.durationMinutes, row.startTime, row.durationMinutes)
    )
  }

  for (const slot of desired) {
    const slotKey = key(slot.date, slot.startTime)
    const ex = existingByKey.get(slotKey)

    if (!ex) {
      if (overlapsKept(slot)) {
        plan.conflicts.push(
          `${slot.date} ${slot.startTime}: schedule slot would overlap a kept slot — skipped`
        )
      } else {
        plan.inserts.push(slot)
      }
      continue
    }

    if (isKept(ex)) {
      if (ex.durationMinutes !== slot.durationMinutes) {
        plan.conflicts.push(
          `${slot.date} ${slot.startTime}: ${describeKept(ex)} runs ${ex.durationMinutes} min but the schedule wants ${slot.durationMinutes} min — left untouched`
        )
      } else {
        // Same time, same length: the kept row already satisfies the plan.
        plan.unchanged++
      }
      continue
    }

    // Available template row at this key: refresh drifted price/duration.
    if (ex.price === slot.price && ex.durationMinutes === slot.durationMinutes) {
      plan.unchanged++
      continue
    }
    if (
      ex.durationMinutes !== slot.durationMinutes &&
      overlapsKept(slot, slotKey)
    ) {
      plan.conflicts.push(
        `${slot.date} ${slot.startTime}: new ${slot.durationMinutes} min slot would overlap a kept slot — not resized`
      )
      continue
    }
    plan.updates.push(slot)
  }

  for (const row of existing) {
    // All manual rows in the window are untouchable, in the plan or not.
    if (row.source === "manual") {
      plan.keptManual++
      continue
    }
    if (desiredKeys.has(key(row.date, row.startTime))) continue
    if (row.status === "booked" || row.status === "held") {
      plan.conflicts.push(
        `${row.date} ${row.startTime}: ${describeKept(row)} sits outside the new schedule — left in place`
      )
      continue
    }
    if (row.status === "available") {
      plan.deletes.push({ date: row.date, startTime: row.startTime })
    }
    // maintenance/blocked template rows outside the plan are kept silently.
  }

  return plan
}
