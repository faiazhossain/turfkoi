import { describe, it, expect } from "vitest"

import {
  findBdHoliday,
  isDuringRamadan,
  listBdHolidays,
  RAMADAN_WINDOWS,
  upcomingBdHolidays,
} from "@/lib/bd-holidays"

describe("listBdHolidays", () => {
  it("includes the fixed national days for any year", () => {
    const names = listBdHolidays(2026).map((h) => h.name)
    expect(names).toContain("Independence Day")
    expect(names).toContain("Victory Day")
    expect(names).toContain("Pahela Baishakh")
    expect(
      listBdHolidays(2026).find((h) => h.name === "Independence Day")?.date
    ).toBe("2026-03-26")
  })

  it("marks lunar dates approximate and fixed dates exact", () => {
    const holidays = listBdHolidays(2026)
    const eid = holidays.find((h) => h.name.startsWith("Eid-ul-Fitr"))
    const independence = holidays.find((h) => h.name === "Independence Day")
    expect(eid?.kind).toBe("lunar")
    expect(eid?.approximate).toBe(true)
    expect(independence?.kind).toBe("fixed")
    expect(independence?.approximate).toBe(false)
  })

  it("returns sorted dates; two holidays may share a date", () => {
    const dates = listBdHolidays(2026).map((h) => h.date)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
    // 2026 Buddha Purnima (lunar estimate) falls on May Day — both are
    // observed, so the seed intentionally carries both entries.
    const mayDay = listBdHolidays(2026).filter((h) => h.date === "2026-05-01")
    expect(mayDay.map((h) => h.name).sort()).toEqual([
      "Buddha Purnima",
      "May Day",
    ])
  })

  it("carries no lunar entries for uncovered years without breaking", () => {
    const holidays = listBdHolidays(2030)
    expect(holidays.every((h) => h.kind === "fixed")).toBe(true)
  })

  it("rejects unsupported years", () => {
    expect(() => listBdHolidays(1999)).toThrow()
  })
})

describe("upcomingBdHolidays", () => {
  it("returns holidays inside the window only, sorted", () => {
    const holidays = upcomingBdHolidays("2026-03-01", 31)
    expect(holidays.map((h) => h.date)).toEqual([
      "2026-03-20", // Shab-e-Qadr
      "2026-03-22",
      "2026-03-23",
      "2026-03-24",
      "2026-03-26", // Independence Day
    ])
  })

  it("spans a year boundary", () => {
    // Window ends 2027-01-09, so 2027's Shab-e-Barat (Jan 14) is out.
    const holidays = upcomingBdHolidays("2026-12-10", 30)
    expect(holidays.map((h) => h.date)).toEqual([
      "2026-12-16",
      "2026-12-25",
    ])
  })

  it("excludes today's-anniversary-of-nothing dates quietly", () => {
    expect(upcomingBdHolidays("2026-07-01", 10)).toEqual([])
  })
})

describe("findBdHoliday / isDuringRamadan", () => {
  it("finds an exact date", () => {
    expect(findBdHoliday("2026-04-14")?.name).toBe("Pahela Baishakh")
    expect(findBdHoliday("2026-07-01")).toBeNull()
  })

  it("detects the Ramadan window by range", () => {
    expect(isDuringRamadan("2026-03-01")).toBe(true)
    expect(isDuringRamadan("2026-03-20")).toBe(true)
    expect(isDuringRamadan("2026-03-21")).toBe(false)
    expect(isDuringRamadan("2025-03-01")).toBe(false)
  })

  it("keeps Ramadan windows internally ordered", () => {
    for (let i = 1; i < RAMADAN_WINDOWS.length; i++) {
      expect(RAMADAN_WINDOWS[i]!.from > RAMADAN_WINDOWS[i - 1]!.from).toBe(true)
    }
  })
})
