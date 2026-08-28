import { addMonthsToMonth } from "../finance"
import { describe, expect, it } from "vitest"

import { detectIntent } from "../assistant"
import { forecastNext, hasSufficientHistory } from "../forecast"

describe("detectIntent (keyword coverage, longest match wins)", () => {
  it("detects profit questions", () => {
    expect(detectIntent("এই মাসে আমার লাভ কত?")).toBe("profit")
    expect(detectIntent("What is my profit?")).toBe("profit")
  })

  it("detects best-day questions over profit", () => {
    expect(detectIntent("কোন দিনে আমার সবচেয়ে বেশি আয় হয়?")).toBe("best_day")
  })

  it("detects expense, comparison, peak-hour and target questions", () => {
    expect(detectIntent("কোন খরচ সবচেয়ে বেশি?")).toBe("biggest_expense")
    expect(detectIntent("গত মাসের তুলনায় ব্যবসা কেমন করেছে?")).toBe("mom_comparison")
    expect(detectIntent("কোন সময়ের slot বেশি লাভজনক?")).toBe("peak_hour")
    expect(detectIntent("monthly target পূরণ করতে দিনে কত টাকা লাভ করতে হবে?")).toBe(
      "target_daily"
    )
  })

  it("returns null for unknown or overlong questions", () => {
    expect(detectIntent("আজ কী খাব?")).toBeNull()
    expect(detectIntent("")).toBeNull()
    expect(detectIntent("a".repeat(301))).toBeNull()
  })
})

describe("forecastNext", () => {
  it("returns null without at least 3 active months", () => {
    expect(
      forecastNext([
        { month: "2026-06", value: 100 },
        { month: "2026-07", value: 200 },
      ])
    ).toBeNull()
    expect(hasSufficientHistory([{ month: "2026-06", value: 0 }])).toBe(false)
  })

  it("ignores zero months and forecasts the weighted trend", () => {
    const r = forecastNext(
      [
        { month: "2025-12", value: 0 },
        { month: "2026-01", value: 100 },
        { month: "2026-02", value: 0 },
        { month: "2026-03", value: 200 },
        { month: "2026-04", value: 300 },
      ],
      addMonthsToMonth
    )
    expect(r).not.toBeNull()
    expect(r?.nextMonth).toBe("2026-05")
    // Weighted avg of (100,200,300) = 233; delta 100 → +50 → 283
    expect(r?.value).toBe(283)
    expect(r?.historyMonths).toBe(3)
  })

  it("dampens the trend and floors at zero", () => {
    const declining = forecastNext(
      [
        { month: "2026-02", value: 900 },
        { month: "2026-03", value: 600 },
        { month: "2026-04", value: 300 },
      ],
      addMonthsToMonth
    )
    // weighted avg = 500; delta = -300 → 350
    expect(declining?.value).toBe(350)
  })
})
