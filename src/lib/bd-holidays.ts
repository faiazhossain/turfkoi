/**
 * Bangladesh holiday calendar seed (slot system P2).
 *
 * Purpose: prompt turf owners ahead of dates that matter ("Eid-ul-Azha is
 * Jun 7 - close the turf or set a holiday rate?"). The seed is a SUGGESTION
 * layer, never a mandate — every exception is still set (or ignored) by the
 * owner, so approximate lunar dates are safe to ship.
 *
 * Accuracy contract:
 *   - kind "fixed": Gregorian-recurring national days; stable year to year.
 *   - kind "lunar": Islamic / Hindu / Buddhist calendar dates MOVE yearly
 *     and depend on moon sighting or ephemeris calls. The entries below are
 *     best estimates for the listed years — update them once a year when the
 *     government announces the official list (typically each November for
 *     the following year). `approximate: true` marks them in the UI.
 */

export type BdHoliday = {
  /** YYYY-MM-DD */
  date: string
  name: string
  kind: "fixed" | "lunar"
  /** True for moon-dependent estimates the UI should caveat. */
  approximate: boolean
}

type FixedHoliday = {
  month: number // 1-12
  day: number
  name: string
}

// Gregorian-recurring. Kept to dates that plausibly change turf demand;
// political-commemoration days have shifted between governments and are
// deliberately omitted (owners can still close those dates manually).
const FIXED_HOLIDAYS: FixedHoliday[] = [
  { month: 2, day: 21, name: "Shaheed Day / International Mother Language Day" },
  { month: 3, day: 26, name: "Independence Day" },
  { month: 4, day: 14, name: "Pahela Baishakh" },
  { month: 5, day: 1, name: "May Day" },
  { month: 8, day: 15, name: "National Mourning Day" },
  { month: 12, day: 16, name: "Victory Day" },
  { month: 12, day: 25, name: "Christmas Day" },
]

// Moon-calendar dates, listed per year. ADD A YEAR BLOCK EACH YEAR when the
// official list lands; `listBdHolidays` simply has nothing lunar to show for
// years not covered here.
const LUNAR_HOLIDAYS: Record<number, Array<{ date: string; name: string }>> = {
  2026: [
    { date: "2026-02-04", name: "Shab-e-Barat" },
    { date: "2026-02-19", name: "First day of Ramadan" },
    { date: "2026-03-20", name: "Shab-e-Qadr" },
    { date: "2026-03-22", name: "Eid-ul-Fitr (day 1)" },
    { date: "2026-03-23", name: "Eid-ul-Fitr (day 2)" },
    { date: "2026-03-24", name: "Eid-ul-Fitr (day 3)" },
    { date: "2026-05-01", name: "Buddha Purnima" },
    { date: "2026-05-28", name: "Eid-ul-Azha (day 1)" },
    { date: "2026-05-29", name: "Eid-ul-Azha (day 2)" },
    { date: "2026-05-30", name: "Eid-ul-Azha (day 3)" },
    { date: "2026-06-24", name: "Ashura" },
    { date: "2026-09-04", name: "Janmashtami" },
    { date: "2026-10-20", name: "Durga Puja (Saptami)" },
    { date: "2026-10-21", name: "Durga Puja (Ashtami)" },
    { date: "2026-10-22", name: "Durga Puja (Navami)" },
    { date: "2026-10-23", name: "Durga Puja (Vijaya Dashami)" },
  ],
  2027: [
    { date: "2027-01-14", name: "Shab-e-Barat" },
    { date: "2027-01-30", name: "First day of Ramadan" },
    { date: "2027-03-11", name: "Eid-ul-Fitr (day 1)" },
    { date: "2027-03-12", name: "Eid-ul-Fitr (day 2)" },
    { date: "2027-03-13", name: "Eid-ul-Fitr (day 3)" },
    { date: "2027-04-20", name: "Buddha Purnima" },
    { date: "2027-05-17", name: "Eid-ul-Azha (day 1)" },
    { date: "2027-05-18", name: "Eid-ul-Azha (day 2)" },
    { date: "2027-05-19", name: "Eid-ul-Azha (day 3)" },
    { date: "2027-06-14", name: "Ashura" },
    { date: "2027-08-24", name: "Janmashtami" },
    { date: "2027-10-09", name: "Durga Puja (Saptami)" },
    { date: "2027-10-10", name: "Durga Puja (Ashtami)" },
    { date: "2027-10-11", name: "Durga Puja (Navami)" },
    { date: "2027-10-12", name: "Durga Puja (Vijaya Dashami)" },
  ],
}

/**
 * Ramadan windows (estimated, moon-dependent) — the seasonal-switch hint for
 * "set up night hours". Slot system P3 turns this into a schedule-switch
 * prompt; P2 surfaces it as an informational note.
 */
export const RAMADAN_WINDOWS: Array<{ year: number; from: string; to: string }> = [
  { year: 2026, from: "2026-02-19", to: "2026-03-20" },
  { year: 2027, from: "2027-01-30", to: "2027-02-28" },
]

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** All seeded holidays in a calendar year, sorted by date. */
export function listBdHolidays(year: number): BdHoliday[] {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error(`listBdHolidays: unsupported year ${year}`)
  }
  const fixed: BdHoliday[] = FIXED_HOLIDAYS.map((h) => ({
    date: `${year}-${pad2(h.month)}-${pad2(h.day)}`,
    name: h.name,
    kind: "fixed" as const,
    approximate: false,
  }))
  const lunar: BdHoliday[] = (LUNAR_HOLIDAYS[year] ?? []).map((h) => ({
    date: h.date,
    name: h.name,
    kind: "lunar" as const,
    approximate: true,
  }))
  return [...fixed, ...lunar].sort((a, b) => a.date.localeCompare(b.date))
}

/** Seeded holidays within [fromDate, fromDate + days), sorted. */
export function upcomingBdHolidays(fromDate: string, days: number): BdHoliday[] {
  if (days < 0) throw new Error("upcomingBdHolidays: negative window")
  const out: BdHoliday[] = []
  for (const year of new Set([Number(fromDate.slice(0, 4)), Number(fromDate.slice(0, 4)) + 1])) {
    if (Number.isNaN(year)) continue
    for (const h of listBdHolidays(year)) {
      if (h.date >= fromDate && h.date < addDays(fromDate, days)) out.push(h)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** The seeded holiday on an exact date, if any. */
export function findBdHoliday(date: string): BdHoliday | null {
  const year = Number(date.slice(0, 4))
  if (Number.isNaN(year)) return null
  return listBdHolidays(year).find((h) => h.date === date) ?? null
}

/** Whether a date falls inside an estimated Ramadan window. */
export function isDuringRamadan(date: string): boolean {
  return RAMADAN_WINDOWS.some((w) => date >= w.from && date <= w.to)
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days))
  return utc.toISOString().slice(0, 10)
}
