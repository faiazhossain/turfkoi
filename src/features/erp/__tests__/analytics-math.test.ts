import { describe, expect, it } from "vitest"

import {
  lastMonths,
  paceFraction,
  percentChange,
  requiredDailyProfit,
} from "../finance"

describe("percentChange", () => {
  it("computes increase and decrease", () => {
    expect(percentChange(115, 100)).toBe(15)
    expect(percentChange(80, 100)).toBe(-20)
  })

  it("returns null when previous is zero", () => {
    expect(percentChange(100, 0)).toBeNull()
  })

  it("handles zero current with nonzero previous", () => {
    expect(percentChange(0, 50)).toBe(-100)
  })
})

describe("paceFraction", () => {
  it("progresses through the month", () => {
    expect(paceFraction("2026-08", "2026-08-01")).toBeCloseTo(1 / 31, 5)
    expect(paceFraction("2026-08", "2026-08-16")).toBeCloseTo(16 / 31, 5)
    expect(paceFraction("2026-08", "2026-08-31")).toBe(1)
  })

  it("clamps out-of-month dates", () => {
    expect(paceFraction("2026-08", "2026-09-15")).toBe(1)
    expect(paceFraction("2026-08", "2026-07-15")).toBe(0)
  })
})

describe("requiredDailyProfit", () => {
  it("divides remaining across days left", () => {
    // Aug 28 → 3 days left (29, 30, 31); remaining 90,000 → 30,000/day
    expect(requiredDailyProfit(100000, 10000, "2026-08", "2026-08-28")).toBe(30000)
  })

  it("returns 0 when the target is already met", () => {
    expect(requiredDailyProfit(50000, 60000, "2026-08", "2026-08-10")).toBe(0)
  })

  it("returns null after month end", () => {
    expect(requiredDailyProfit(50000, 0, "2026-08", "2026-09-02")).toBeNull()
  })
})

describe("lastMonths", () => {
  it("returns n months ending with the given month, oldest first", () => {
    expect(lastMonths("2026-08", 6)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ])
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"])
  })
})
