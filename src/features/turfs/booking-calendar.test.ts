import { describe, expect, it } from "vitest"

import {
  classifyBookingDays,
  slotEndTime,
  type PublicSlot,
} from "./booking-calendar"

// Range: September 2026, today 2026-09-02, horizon ends 2026-09-30.
const RANGE = {
  monthStart: "2026-09-01",
  monthEnd: "2026-09-30",
  today: "2026-09-02",
  horizonEnd: "2026-09-30",
}

function slot(overrides: Partial<PublicSlot> & { date: string }): PublicSlot {
  return {
    startTime: "18:00",
    endTime: "19:00",
    durationMinutes: 60,
    price: 800,
    status: "available",
    label: null,
    ...overrides,
  }
}

describe("slotEndTime", () => {
  it("adds duration within the day", () => {
    expect(slotEndTime("17:00", 90)).toBe("18:30")
  })

  it("wraps past midnight", () => {
    expect(slotEndTime("23:30", 90)).toBe("01:00")
  })
})

describe("classifyBookingDays", () => {
  it("marks days before today as past", () => {
    const days = classifyBookingDays([], [], RANGE)
    expect(days["2026-09-01"]!.status).toBe("past")
    expect(days["2026-09-02"]!.status).not.toBe("past")
  })

  it("marks days past the horizon as outside", () => {
    const days = classifyBookingDays([], [], { ...RANGE, horizonEnd: "2026-09-10" })
    expect(days["2026-09-10"]!.status).toBe("empty")
    expect(days["2026-09-11"]!.status).toBe("outside")
  })

  it("classifies open days when any slot is available", () => {
    const days = classifyBookingDays(
      [
        slot({ date: "2026-09-05", status: "booked" }),
        slot({ date: "2026-09-05", startTime: "20:00", endTime: "21:00" }),
      ],
      [],
      RANGE,
      // Fixed clock: without it the real 20-min bookability cutoff turns the
      // slots "past" once the wall clock passes their start times.
      new Date("2026-09-02T12:00:00")
    )
    expect(days["2026-09-05"]!.status).toBe("open")
    expect(days["2026-09-05"]!.slots).toHaveLength(2)
  })

  it("classifies full days when every slot is unavailable", () => {
    const days = classifyBookingDays(
      [
        slot({ date: "2026-09-06", status: "booked" }),
        slot({ date: "2026-09-06", startTime: "20:00", endTime: "21:00", status: "held" }),
      ],
      [],
      RANGE
    )
    expect(days["2026-09-06"]!.status).toBe("full")
  })

  it("treats all-blocked days as full, not empty", () => {
    const days = classifyBookingDays(
      [slot({ date: "2026-09-07", status: "blocked" })],
      [],
      RANGE
    )
    expect(days["2026-09-07"]!.status).toBe("full")
  })

  it("keeps slots on closed days and carries the owner's reason", () => {
    const days = classifyBookingDays(
      [slot({ date: "2026-09-08" })],
      [{ date: "2026-09-08", reason: "Eid-ul-Fitr" }],
      RANGE
    )
    expect(days["2026-09-08"]!.status).toBe("closed")
    expect(days["2026-09-08"]!.closedReason).toBe("Eid-ul-Fitr")
    expect(days["2026-09-08"]!.slots).toHaveLength(1)
  })

  it("marks bookable days without slots as empty", () => {
    const days = classifyBookingDays([], [], RANGE)
    expect(days["2026-09-15"]!.status).toBe("empty")
  })

  it("ignores slot rows outside the displayed month", () => {
    const days = classifyBookingDays(
      [slot({ date: "2026-08-31" }), slot({ date: "2026-10-01" })],
      [],
      RANGE
    )
    expect(Object.keys(days)).not.toContain("2026-08-31")
    expect(Object.keys(days)).not.toContain("2026-10-01")
  })
})
