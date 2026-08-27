import { MINUTES_PER_DAY, iterateDates, toHHMM, toMinutes } from "@/lib/slot-expansion"

/**
 * Public booking calendar (turf detail page): pure helpers that turn a
 * month of slot rows into per-day availability. The server aggregates;
 * the client calendar renders — statuses are always real DB state.
 */

/** One slot as shown in the day sheet (already normalized for display). */
export type PublicSlot = {
  date: string
  /** "HH:mm" — pg `time` returns "HH:mm:ss", normalized by the caller. */
  startTime: string
  /** "HH:mm" end; wraps to next-day clock time for past-midnight slots. */
  endTime: string
  durationMinutes: number
  /** Whole Taka. */
  price: number
  status: string
  /** Owner's section label ("Evening"), when set. */
  label: string | null
}

export type DayStatus =
  /** Green — at least one available slot. */
  | "open"
  /** Red — slots exist, none available (booked/held/blocked/maintenance). */
  | "full"
  /** Owner closed the date via a day exception. */
  | "closed"
  /** Bookable window, but no slots published. */
  | "empty"
  | "past"
  | "outside"

export type BookingDay = {
  status: DayStatus
  slots: PublicSlot[]
  closedReason: string | null
}

export type ClosedDayInput = { date: string; reason: string | null }

/** Display end time of a slot; wraps past midnight (23:30/90 → "01:00"). */
export function slotEndTime(startTime: string, durationMinutes: number): string {
  const end = (toMinutes(startTime) + durationMinutes) % MINUTES_PER_DAY
  return toHHMM(end)
}

/**
 * Classify every date of the displayed month. Priority: past → outside
 * horizon → closed → empty → full → open. Unbookable-but-not-closed days
 * (all held/blocked/maintenance) count as "full": to a player the day is
 * simply sold out, and splitting statuses would leak internal ops detail.
 */
export function classifyBookingDays(
  slots: PublicSlot[],
  closedDays: ClosedDayInput[],
  range: { monthStart: string; monthEnd: string; today: string; horizonEnd: string }
): Record<string, BookingDay> {
  const byDate = new Map<string, PublicSlot[]>()
  for (const slot of slots) {
    const list = byDate.get(slot.date)
    if (list) list.push(slot)
    else byDate.set(slot.date, [slot])
  }
  const closedByDate = new Map(closedDays.map((c) => [c.date, c.reason ?? null]))

  const days: Record<string, BookingDay> = {}
  for (const date of iterateDates(range.monthStart, range.monthEnd)) {
    if (date < range.today) {
      days[date] = { status: "past", slots: [], closedReason: null }
      continue
    }
    if (date > range.horizonEnd) {
      days[date] = { status: "outside", slots: [], closedReason: null }
      continue
    }
    const slotsToday = byDate.get(date) ?? []
    const closedReason = closedByDate.has(date) ? closedByDate.get(date)! : null
    if (closedByDate.has(date)) {
      days[date] = { status: "closed", slots: slotsToday, closedReason }
      continue
    }
    if (slotsToday.length === 0) {
      days[date] = { status: "empty", slots: [], closedReason: null }
      continue
    }
    const hasAvailable = slotsToday.some((s) => s.status === "available")
    days[date] = {
      status: hasAvailable ? "open" : "full",
      slots: slotsToday,
      closedReason: null,
    }
  }
  return days
}
