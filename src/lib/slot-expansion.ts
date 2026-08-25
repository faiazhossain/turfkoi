/**
 * Slot expansion — pure date/time math behind the schedule system (P1).
 *
 * A weekly schedule is a set of "sections" (a labeled window on one weekday
 * with its own slot length, turnaround gap, and price). Materialization turns
 * sections into concrete slot drafts; nothing here touches the database.
 *
 * Bangladesh observes no DST (fixed UTC+6 since 2009 and no planned change),
 * so naive minute arithmetic over HH:mm strings is permanently safe — this
 * module deliberately avoids timezone machinery beyond labeling "today" in
 * Asia/Dhaka for the nightly job.
 */

export const MINUTES_PER_DAY = 24 * 60

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

export type ScheduleSection = {
  /** 0 = Sunday ... 6 = Saturday, matching Date#getUTCDay. */
  dayOfWeek: number
  /** Optional owner-facing label, e.g. "Morning" / "Evening". */
  label?: string | null
  /** "HH:mm" 24h, inclusive slot start bound of the section. */
  startTime: string
  /**
   * "HH:mm" exclusive end bound. endTime <= startTime means the window wraps
   * past midnight (Ramadan night hours like 22:00-03:00); slots starting
   * after midnight are attributed to the next calendar date.
   */
  endTime: string
  /** Slot length in minutes (30-180, multiple of 5). */
  slotMinutes: number
  /** Turnaround between consecutive slots (BD turfs commonly use 10). */
  gapMinutes: number
  /** Price per slot in this section (whole Taka). */
  price: number
}

export type SlotDraft = {
  startTime: string
  durationMinutes: number
  price: number
}

/** A draft pinned to a calendar date, ready to materialize. */
export type DatedSlotDraft = SlotDraft & { date: string }

export type PriceOverride =
  | { mode: "multiplier" | "absolute"; value: number }
  | null

/**
 * Slot system P2: per-date rule from a turf_date_exceptions row. A closed
 * date produces no slots — neither from its own sections nor from a previous
 * evening's wrapping section spilling into it. An override rescales or
 * replaces section prices for that date only.
 */
export type DayRule = {
  closed?: boolean
  override?: PriceOverride
}

const HH_MM = /^\d{2}:\d{2}$/

export function toMinutes(hhmm: string): number {
  if (!HH_MM.test(hhmm)) {
    throw new Error(`toMinutes: expected HH:mm, got "${hhmm}"`)
  }
  const h = Number(hhmm.slice(0, 2))
  const m = Number(hhmm.slice(3, 5))
  if (h > 23 || m > 59) {
    throw new Error(`toMinutes: invalid time "${hhmm}"`)
  }
  return h * 60 + m
}

export function toHHMM(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new Error(`toHHMM: expected 0-1439 minutes, got ${minutes}`)
  }
  const h = String(Math.floor(minutes / 60)).padStart(2, "0")
  const m = String(minutes % 60).padStart(2, "0")
  return `${h}:${m}`
}

/**
 * Resolve a slot's final price from the section base plus an optional
 * override. Multipliers round to whole Taka — bKash flows don't deal in
 * paisa (see computeFees in pricing.ts). Precedence contract for the whole
 * system: single-slot touch > date exception > section price.
 */
export function resolvePrice(base: number, override: PriceOverride = null): number {
  if (!Number.isFinite(base) || base < 0) {
    throw new Error(`resolvePrice: invalid base price ${base}`)
  }
  if (!override) return Math.round(base)
  if (override.mode === "absolute") {
    if (!Number.isFinite(override.value) || override.value < 0) {
      throw new Error(`resolvePrice: invalid override ${override.value}`)
    }
    return Math.round(override.value)
  }
  if (!Number.isFinite(override.value) || override.value < 0) {
    throw new Error(`resolvePrice: invalid multiplier ${override.value}`)
  }
  return Math.round(base * override.value)
}

/** Absolute [start, end) span of a section, unwrapping midnight crossings. */
function sectionSpan(section: ScheduleSection): { start: number; end: number } {
  const start = toMinutes(section.startTime)
  let end = toMinutes(section.endTime)
  if (end <= start) end += MINUTES_PER_DAY
  return { start, end }
}

/**
 * Whether two same-date slot ranges intersect. Intervals are compared as
 * plain minute numbers without wrapping: a 23:30/90 slot's spill past
 * midnight belongs to the NEXT date, so a 00:30 slot on the same date never
 * overlaps it. Callers checking a midnight-adjacent add must also test the
 * previous date's rows (see overlapsAny).
 */
export function rangesOverlap(
  aStart: string,
  aMinutes: number,
  bStart: string,
  bMinutes: number
): boolean {
  const a0 = toMinutes(aStart)
  const b0 = toMinutes(bStart)
  return a0 < b0 + bMinutes && b0 < a0 + aMinutes
}

/** Any of `existing` overlapping the proposed [startTime, +durationMinutes). */
export function overlapsAny(
  existing: Array<{ startTime: string; durationMinutes: number }>,
  startTime: string,
  durationMinutes: number
): string | null {
  for (const row of existing) {
    if (rangesOverlap(startTime, durationMinutes, row.startTime, row.durationMinutes)) {
      return row.startTime
    }
  }
  return null
}

/**
 * Overlap between a proposed slot and a row on an ADJACENT date, possible
 * only when one of them spills past midnight. rangesOverlap can't see this
 * (both intervals sit on their own dates), so manual adds near midnight
 * check neighbors explicitly:
 *
 *   relation "previous": the row is yesterday's and spills into today
 *   relation "next":     the proposal spills into tomorrow, over the row
 */
export function spillOverlap(
  proposed: { startTime: string; durationMinutes: number },
  adjacentRow: { startTime: string; durationMinutes: number },
  relation: "previous" | "next"
): boolean {
  const pStart = toMinutes(proposed.startTime)
  const pSpill = pStart + proposed.durationMinutes - MINUTES_PER_DAY
  const rStart = toMinutes(adjacentRow.startTime)
  const rSpill = rStart + adjacentRow.durationMinutes - MINUTES_PER_DAY
  if (relation === "previous") {
    return rSpill > 0 && pStart < rSpill
  }
  return pSpill > 0 && rStart < pSpill
}

/**
 * Core expansion for one day's sections: slot drafts with a flag marking
 * starts that fall past midnight (from a wrapping section). Slots are
 * emitted while they FIT ENTIRELY inside the section — a trailing remainder
 * smaller than slotMinutes is dropped, the same rule every turf owner
 * applies to a closing time.
 */
function expandDayDetailed(
  sections: ScheduleSection[],
  dayOfWeek: number,
  override: PriceOverride
): Array<SlotDraft & { nextDay: boolean }> {
  const daySections = sections
    .filter((s) => s.dayOfWeek === dayOfWeek)
    .sort((a, b) => sectionSpan(a).start - sectionSpan(b).start)

  const out: Array<SlotDraft & { nextDay: boolean }> = []
  for (const section of daySections) {
    const { start, end } = sectionSpan(section)
    for (let cursor = start; cursor + section.slotMinutes <= end; ) {
      out.push({
        startTime: toHHMM(cursor % MINUTES_PER_DAY),
        durationMinutes: section.slotMinutes,
        price: resolvePrice(section.price, override),
        nextDay: cursor >= MINUTES_PER_DAY,
      })
      cursor += section.slotMinutes + section.gapMinutes
    }
  }
  return out
}

/**
 * Expand one day's sections into slot drafts, in section order (sections are
 * sorted by start time).
 */
export function expandSectionsForDay(
  sections: ScheduleSection[],
  dayOfWeek: number,
  override: PriceOverride = null
): SlotDraft[] {
  return expandDayDetailed(sections, dayOfWeek, override).map((draft) => ({
    startTime: draft.startTime,
    durationMinutes: draft.durationMinutes,
    price: draft.price,
  }))
}

/**
 * Expand a schedule across a date range. Slots whose start falls past
 * midnight (from a wrapping section) are attributed to the next calendar
 * date — the row belongs to the day it starts on. `rules` (P2) maps a date
 * to its exception: closed dates contribute nothing and absorb nothing
 * (spillover into them is dropped), override dates apply their price rule.
 */
export function expandScheduleRange(
  sections: ScheduleSection[],
  fromDate: string,
  toDate: string,
  rules: Map<string, DayRule> = new Map()
): DatedSlotDraft[] {
  if (toDate < fromDate) {
    throw new Error(`expandScheduleRange: to (${toDate}) before from (${fromDate})`)
  }
  const out: DatedSlotDraft[] = []
  for (const date of iterateDates(fromDate, toDate)) {
    if (rules.get(date)?.closed) continue
    const rule = rules.get(date)
    for (const draft of expandDayDetailed(
      sections,
      dayOfWeekOf(date),
      rule?.override ?? null
    )) {
      const slotDate = draft.nextDay ? addDays(date, 1) : date
      // A spilling slot lands on a closed date -> dropped, not moved.
      if (rules.get(slotDate)?.closed) continue
      out.push({
        date: slotDate,
        startTime: draft.startTime,
        durationMinutes: draft.durationMinutes,
        price: draft.price,
      })
    }
  }
  return out
}

/**
 * Pairwise section conflicts: two sections on the same weekday overlapping,
 * or a wrapping section spilling into the next weekday's early sections.
 * Empty array means the weekly layout is physically schedulable.
 */
export function findSectionConflicts(
  sections: ScheduleSection[]
): string[] {
  const conflicts: string[] = []
  const name = (s: ScheduleSection) =>
    `${DAY_NAMES[s.dayOfWeek] ?? "day"} ${s.startTime}-${s.endTime}`

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i]!
      const b = sections[j]!
      if (a.dayOfWeek === b.dayOfWeek) {
        const sa = sectionSpan(a)
        const sb = sectionSpan(b)
        if (sa.start < sb.end && sb.start < sa.end) {
          conflicts.push(`${name(a)} overlaps ${name(b)} on the same day`)
        }
        continue
      }
      // Cross-day: only a wrapping section can reach into the next weekday.
      // The wrap spillover occupies [00:00, endTime) of the following day.
      for (const [first, next] of [
        [a, b],
        [b, a],
      ] as const) {
        if ((first.dayOfWeek + 1) % 7 !== next.dayOfWeek) continue
        const sf = sectionSpan(first)
        if (sf.end <= MINUTES_PER_DAY) continue // does not wrap
        const spillEnd = sf.end - MINUTES_PER_DAY
        const nextStart = toMinutes(next.startTime)
        if (nextStart < spillEnd) {
          conflicts.push(
            `${name(first)} wraps past midnight into ${name(next)}`
          )
        }
      }
    }
  }
  return conflicts
}

// --- Calendar helpers (UTC-based; dates are plain YYYY-MM-DD strings) ---

/** Iterate inclusive YYYY-MM-DD dates. */
export function iterateDates(fromDate: string, toDate: string): string[] {
  const out: string[] = []
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) out.push(d)
  return out
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) throw new Error(`addDays: invalid date "${date}"`)
  const utc = new Date(Date.UTC(y, m - 1, d + days))
  return utc.toISOString().slice(0, 10)
}

/** Day of week (0=Sunday) for a YYYY-MM-DD, independent of server timezone. */
export function dayOfWeekOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) throw new Error(`dayOfWeekOf: invalid date "${date}"`)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Today's YYYY-MM-DD in Asia/Dhaka (the only timezone this product has). */
export function todayInDhaka(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/**
 * Owner-facing label of the section covering a slot's start time on a date
 * (e.g. "Evening"), for peak/off-peak display on the public page. Slots
 * spilling from a previous evening's wrapping section inherit its label.
 */
export function sectionLabelForSlot(
  sections: ScheduleSection[],
  date: string,
  startTime: string
): string | null {
  const dow = dayOfWeekOf(date)
  const start = toMinutes(startTime)
  const own = sections
    .filter((s) => s.dayOfWeek === dow)
    .sort((a, b) => sectionSpan(a).start - sectionSpan(b).start)
  for (const s of own) {
    const { start: ss, end: se } = sectionSpan(s)
    if (start >= ss && start < se) return s.label ?? null
  }
  // Midnight spillover: yesterday's wrap section reaching into today.
  const prevDow = (dow + 6) % 7
  for (const s of sections.filter((x) => x.dayOfWeek === prevDow)) {
    const { end: se } = sectionSpan(s)
    if (se > MINUTES_PER_DAY && start < se - MINUTES_PER_DAY) {
      return s.label ?? null
    }
  }
  return null
}
