import { describe, it, expect } from "vitest"

import {
  addDays,
  dayOfWeekOf,
  expandScheduleRange,
  expandSectionsForDay,
  findSectionConflicts,
  overlapsAny,
  rangesOverlap,
  resolvePrice,
  sectionLabelForSlot,
  spillOverlap,
  toHHMM,
  toMinutes,
  todayInDhaka,
  type ScheduleSection,
} from "@/lib/slot-expansion"

function section(overrides: Partial<ScheduleSection> = {}): ScheduleSection {
  return {
    dayOfWeek: 1,
    label: null,
    startTime: "16:00",
    endTime: "20:00",
    slotMinutes: 60,
    gapMinutes: 0,
    price: 1000,
    ...overrides,
  }
}

describe("toMinutes / toHHMM", () => {
  it("round-trips every half hour of the day", () => {
    for (let m = 0; m < 24 * 60; m += 30) {
      expect(toMinutes(toHHMM(m))).toBe(m)
    }
  })

  it("rejects malformed values", () => {
    expect(() => toMinutes("7:00")).toThrow()
    expect(() => toMinutes("24:00")).toThrow()
    expect(() => toMinutes("12:60")).toThrow()
    expect(() => toHHMM(1440)).toThrow()
    expect(() => toHHMM(-1)).toThrow()
  })
})

describe("expandSectionsForDay", () => {
  it("lays out back-to-back slots when gap is zero", () => {
    const drafts = expandSectionsForDay(
      [section({ startTime: "16:00", endTime: "19:00", slotMinutes: 60 })],
      1
    )
    expect(drafts.map((d) => d.startTime)).toEqual(["16:00", "17:00", "18:00"])
    expect(drafts.every((d) => d.durationMinutes === 60 && d.price === 1000)).toBe(
      true
    )
  })

  it("honors a turnaround gap between slots (Team Ground 10-min pattern)", () => {
    const drafts = expandSectionsForDay(
      [section({ startTime: "16:00", endTime: "20:00", slotMinutes: 60, gapMinutes: 10 })],
      1
    )
    // 16:00, 17:10, 18:20 fit; 19:30 + 60 = 20:30 exceeds the 20:00 close.
    expect(drafts.map((d) => d.startTime)).toEqual(["16:00", "17:10", "18:20"])
  })

  it("drops a trailing remainder smaller than one slot", () => {
    const drafts = expandSectionsForDay(
      [section({ startTime: "16:00", endTime: "19:30", slotMinutes: 90 })],
      1
    )
    // 16:00 and 17:30 fit (end 19:00 <= 19:30); a 19:00 start would run to 20:30.
    expect(drafts.map((d) => d.startTime)).toEqual(["16:00", "17:30"])
  })

  it("expands only the matching weekday", () => {
    const drafts = expandSectionsForDay(
      [section({ dayOfWeek: 5, label: "Friday evening" })],
      1
    )
    expect(drafts).toEqual([])
  })

  it("sorts output by section start when sections are unordered", () => {
    const drafts = expandSectionsForDay(
      [
        section({ label: "Evening", startTime: "17:00", endTime: "19:00", price: 1200 }),
        section({ label: "Morning", startTime: "08:00", endTime: "10:00", price: 800 }),
      ],
      1
    )
    expect(drafts.map((d) => d.price)).toEqual([800, 800, 1200, 1200])
  })

  it("wraps a midnight-crossing section and attributes starts past midnight", () => {
    // Ramadan hours: 22:00-03:00, 60-min slots.
    const drafts = expandScheduleRange(
      [section({ dayOfWeek: 5, startTime: "22:00", endTime: "03:00", slotMinutes: 60 })],
      "2026-03-06", // a Friday
      "2026-03-06"
    )
    expect(drafts.map((d) => `${d.date} ${d.startTime}`)).toEqual([
      "2026-03-06 22:00",
      "2026-03-06 23:00",
      "2026-03-07 00:00",
      "2026-03-07 01:00",
      "2026-03-07 02:00",
    ])
  })

  it("wraps with a gap and 90-min slots", () => {
    // 23:00-02:00, 90 min + 15 gap: only 23:00 fits (00:45 + 90 = 02:15 > 02:00).
    const drafts = expandSectionsForDay(
      [section({ startTime: "23:00", endTime: "02:00", slotMinutes: 90, gapMinutes: 15 })],
      1
    )
    expect(drafts.map((d) => d.startTime)).toEqual(["23:00"])
  })
})

describe("expandScheduleRange", () => {
  it("emits per-date drafts only on matching weekdays", () => {
    const drafts = expandScheduleRange(
      [section({ dayOfWeek: 5, startTime: "09:00", endTime: "11:00", slotMinutes: 60 })],
      "2026-03-02", // Monday
      "2026-03-09" // next Monday
    )
    // Only 2026-03-06 (Friday) matches.
    expect(drafts.map((d) => `${d.date} ${d.startTime}`)).toEqual([
      "2026-03-06 09:00",
      "2026-03-06 10:00",
    ])
  })

  it("throws when the range is inverted", () => {
    expect(() =>
      expandScheduleRange([section()], "2026-03-09", "2026-03-02")
    ).toThrow()
  })

  it("skips a closed date entirely (P2 date exception)", () => {
    const drafts = expandScheduleRange(
      [section({ dayOfWeek: 5, startTime: "09:00", endTime: "11:00", slotMinutes: 60 })],
      "2026-03-06",
      "2026-03-13",
      new Map([
        ["2026-03-06", { closed: true }],
        ["2026-03-13", { closed: false }],
      ])
    )
    // 2026-03-06 closed -> nothing; 2026-03-13 (next Friday) open -> slots.
    expect(drafts.map((d) => d.date)).toEqual(["2026-03-13", "2026-03-13"])
  })

  it("drops a wrapping section's spillover into a closed next date", () => {
    // Thursday night 22:00-03:00 spills into Friday; Friday is closed.
    const drafts = expandScheduleRange(
      [section({ dayOfWeek: 4, startTime: "22:00", endTime: "03:00", slotMinutes: 60 })],
      "2026-03-05", // Thursday
      "2026-03-05",
      new Map([["2026-03-06", { closed: true }]])
    )
    // Only Thursday-side starts survive; the 00:00/01:00/02:00 spillover is dropped.
    expect(drafts.map((d) => `${d.date} ${d.startTime}`)).toEqual([
      "2026-03-05 22:00",
      "2026-03-05 23:00",
    ])
  })

  it("applies a holiday override to that date only", () => {
    const drafts = expandScheduleRange(
      [section({ dayOfWeek: 5, startTime: "09:00", endTime: "11:00", slotMinutes: 60, price: 800 })],
      "2026-03-06",
      "2026-03-13",
      new Map([
        ["2026-03-06", { override: { mode: "multiplier", value: 1.25 } }],
      ])
    )
    const byDate = new Map(drafts.map((d) => [d.date, d.price]))
    expect(byDate.get("2026-03-06")).toBe(1000) // 800 * 1.25
    expect(byDate.get("2026-03-13")).toBe(800)
  })

  it("applies the evening date's override to its post-midnight spillover", () => {
    // A holiday night rate covers the whole night session, including the
    // slots that start after midnight on the next calendar date.
    const drafts = expandScheduleRange(
      [section({ dayOfWeek: 4, startTime: "22:00", endTime: "01:00", slotMinutes: 60, price: 1000 })],
      "2026-03-05",
      "2026-03-05",
      new Map([
        ["2026-03-05", { override: { mode: "multiplier", value: 1.5 } }],
      ])
    )
    expect(drafts.map((d) => `${d.date} ${d.startTime} ${d.price}`)).toEqual([
      "2026-03-05 22:00 1500",
      "2026-03-05 23:00 1500",
      "2026-03-06 00:00 1500",
    ])
  })
})

describe("resolvePrice", () => {
  it("returns the rounded base when no override applies", () => {
    expect(resolvePrice(1000)).toBe(1000)
    expect(resolvePrice(999.4)).toBe(999)
  })

  it("multiplies holiday rates and rounds to whole Taka", () => {
    expect(resolvePrice(850, { mode: "multiplier", value: 1.25 })).toBe(1063)
    expect(resolvePrice(1000, { mode: "multiplier", value: 0.9 })).toBe(900)
  })

  it("replaces the price in absolute mode", () => {
    expect(resolvePrice(850, { mode: "absolute", value: 2500 })).toBe(2500)
  })

  it("rejects invalid inputs", () => {
    expect(() => resolvePrice(-1)).toThrow()
    expect(() => resolvePrice(1000, { mode: "multiplier", value: -2 })).toThrow()
    expect(() => resolvePrice(1000, { mode: "absolute", value: NaN })).toThrow()
  })
})

describe("rangesOverlap / overlapsAny", () => {
  it("treats back-to-back slots as non-overlapping", () => {
    expect(rangesOverlap("18:00", 60, "19:00", 60)).toBe(false)
  })

  it("detects partial and contained overlaps", () => {
    expect(rangesOverlap("18:30", 60, "19:00", 60)).toBe(true)
    expect(rangesOverlap("18:00", 120, "19:00", 30)).toBe(true)
  })

  it("does not overlap a midnight spillover with the same date's early slots", () => {
    // 23:30/90 spills into the NEXT date; 00:30 on the same date is earlier.
    expect(rangesOverlap("23:30", 90, "00:30", 60)).toBe(false)
  })

  it("overlaps two late slots that both cross midnight", () => {
    expect(rangesOverlap("23:00", 120, "23:50", 30)).toBe(true)
  })

  it("overlapsAny reports the conflicting slot's start", () => {
    const existing = [
      { startTime: "18:00", durationMinutes: 60 },
      { startTime: "20:00", durationMinutes: 90 },
    ]
    expect(overlapsAny(existing, "19:30", 60)).toBe("20:00")
    expect(overlapsAny(existing, "19:00", 30)).toBeNull()
  })
})

describe("findSectionConflicts", () => {
  it("accepts a normal two-section day (jummah-shaped gap)", () => {
    const conflicts = findSectionConflicts([
      section({ dayOfWeek: 5, startTime: "08:00", endTime: "12:00" }),
      section({ dayOfWeek: 5, startTime: "14:30", endTime: "23:00", price: 1200 }),
    ])
    expect(conflicts).toEqual([])
  })

  it("flags two sections overlapping on the same day", () => {
    const conflicts = findSectionConflicts([
      section({ startTime: "08:00", endTime: "12:00" }),
      section({ startTime: "11:00", endTime: "14:00" }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.type).toBe("overlap")
  })

  it("flags a wrapping section reaching into the next weekday's early section", () => {
    const conflicts = findSectionConflicts([
      section({ dayOfWeek: 4, startTime: "22:00", endTime: "02:00" }), // Thu night
      section({ dayOfWeek: 5, startTime: "01:00", endTime: "03:00" }), // Fri early
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.type).toBe("wrap")
  })

  it("allows a wrapping section when the next weekday opens later", () => {
    const conflicts = findSectionConflicts([
      section({ dayOfWeek: 4, startTime: "22:00", endTime: "02:00" }),
      section({ dayOfWeek: 5, startTime: "10:00", endTime: "14:00" }),
    ])
    expect(conflicts).toEqual([])
  })
})

describe("calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("computes weekday independent of server timezone", () => {
    expect(dayOfWeekOf("2026-03-06")).toBe(5) // Friday
    expect(dayOfWeekOf("2026-03-08")).toBe(0) // Sunday
  })

  it("labels today in Asia/Dhaka for a known instant", () => {
    // 2026-03-06 20:30 UTC is already 2026-03-07 02:30 in Dhaka (UTC+6).
    expect(todayInDhaka(new Date("2026-03-06T20:30:00Z"))).toBe("2026-03-07")
  })
})

describe("spillOverlap", () => {
  it("flags a proposal under yesterday's midnight spillover", () => {
    // Yesterday 23:30/90 runs to 01:00 today; today 00:30 collides.
    expect(
      spillOverlap(
        { startTime: "00:30", durationMinutes: 60 },
        { startTime: "23:30", durationMinutes: 90 },
        "previous"
      )
    ).toBe(true)
    // Today 01:00 starts exactly when the spill ends - no overlap.
    expect(
      spillOverlap(
        { startTime: "01:00", durationMinutes: 60 },
        { startTime: "23:30", durationMinutes: 90 },
        "previous"
      )
    ).toBe(false)
  })

  it("ignores a previous-day slot that ends before midnight", () => {
    expect(
      spillOverlap(
        { startTime: "00:30", durationMinutes: 60 },
        { startTime: "22:00", durationMinutes: 60 },
        "previous"
      )
    ).toBe(false)
  })

  it("flags a proposal spilling over tomorrow's early slot", () => {
    expect(
      spillOverlap(
        { startTime: "23:30", durationMinutes: 90 },
        { startTime: "00:30", durationMinutes: 60 },
        "next"
      )
    ).toBe(true)
    expect(
      spillOverlap(
        { startTime: "23:00", durationMinutes: 60 },
        { startTime: "00:30", durationMinutes: 60 },
        "next"
      )
    ).toBe(false)
  })
})

describe("sectionLabelForSlot", () => {
  const sections: ScheduleSection[] = [
    section({ dayOfWeek: 5, label: "Morning", startTime: "08:00", endTime: "12:00" }),
    section({ dayOfWeek: 5, label: "Evening", startTime: "17:00", endTime: "23:00" }),
    // Thursday night wrap for the spillover case.
    section({ dayOfWeek: 4, label: "Ramadan nights", startTime: "22:00", endTime: "02:00" }),
  ]

  it("returns the covering section's label", () => {
    expect(sectionLabelForSlot(sections, "2026-03-06", "18:00")).toBe("Evening")
    expect(sectionLabelForSlot(sections, "2026-03-06", "09:00")).toBe("Morning")
  })

  it("returns null for unlabeled or uncovered slots", () => {
    expect(sectionLabelForSlot(sections, "2026-03-06", "14:00")).toBeNull()
    const unlabeled = sections.map(({ ...s }) => ({ ...s, label: null }))
    expect(sectionLabelForSlot(unlabeled, "2026-03-06", "18:00")).toBeNull()
  })

  it("inherits the label of yesterday's wrapping section after midnight", () => {
    // Friday 00:30 is Thursday night's Ramadan section spilling over.
    expect(sectionLabelForSlot(sections, "2026-03-06", "00:30")).toBe(
      "Ramadan nights"
    )
    // Past the spill end (02:00) it is uncovered.
    expect(sectionLabelForSlot(sections, "2026-03-06", "02:30")).toBeNull()
  })
})
