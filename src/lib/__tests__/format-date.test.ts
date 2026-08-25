import { describe, it, expect } from "vitest"

import {
  formatDistanceToNowIn,
  formatSlotDate,
  humanDateLocale,
} from "../format-date"

/** Locale-aware date wrappers — pure, deterministic given a fixed date. */
describe("format-date", () => {
  it("maps locales to BCP-47 tags for human display", () => {
    expect(humanDateLocale("bn")).toBe("bn-BD")
    expect(humanDateLocale("en")).toBe("en-CA")
  })

  it("renders relative distances in the active locale script", () => {
    const now = Date.now()
    const minuteAgo = new Date(now - 60_000)
    // bn uses Bengali digits; en never does.
    expect(formatDistanceToNowIn(minuteAgo, "bn")).toMatch(/[০-৯]/)
    expect(formatDistanceToNowIn(minuteAgo, "en")).not.toMatch(/[০-৯]/)
  })

  it("adds the suffix when requested", () => {
    const now = Date.now()
    expect(formatDistanceToNowIn(new Date(now - 60_000), "en", { addSuffix: true })).toContain("ago")
  })

  it("formats slot dates without UTC shift and in-locale", () => {
    const bn = formatSlotDate("2026-01-05", "bn")
    const en = formatSlotDate("2026-01-05", "en")
    expect(bn).toMatch(/[০-৯]/)
    expect(en).toBe("Mon, Jan 5")
    // Invalid ISO falls through untouched.
    expect(formatSlotDate("not-a-date", "en")).toBe("not-a-date")
  })
})
