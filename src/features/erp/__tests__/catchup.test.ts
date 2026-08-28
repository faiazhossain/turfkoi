import { describe, expect, it } from "vitest"

import { catchUpRule } from "../finance"

describe("catchUpRule (recurring bill catch-up)", () => {
  it("posts one occurrence when the due date is today", () => {
    const r = catchUpRule({ nextDueDate: "2026-08-28", frequency: "monthly" }, "2026-08-28")
    expect(r.occurrences).toEqual(["2026-08-28"])
    expect(r.nextDueDate).toBe("2026-09-28")
  })

  it("does nothing when not yet due", () => {
    const r = catchUpRule({ nextDueDate: "2026-09-01", frequency: "monthly" }, "2026-08-28")
    expect(r.occurrences).toEqual([])
    expect(r.nextDueDate).toBe("2026-09-01")
  })

  it("catches up multiple missed monthly cycles", () => {
    const r = catchUpRule({ nextDueDate: "2026-05-10", frequency: "monthly" }, "2026-08-20")
    expect(r.occurrences).toEqual(["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10"])
    expect(r.nextDueDate).toBe("2026-09-10")
  })

  it("handles quarterly and yearly frequencies", () => {
    expect(catchUpRule({ nextDueDate: "2026-02-01", frequency: "quarterly" }, "2026-08-01").occurrences).toEqual([
      "2026-02-01",
      "2026-05-01",
      "2026-08-01",
    ])
    expect(catchUpRule({ nextDueDate: "2026-01-01", frequency: "yearly" }, "2026-08-01").nextDueDate).toBe("2027-01-01")
  })

  it("clamps day-of-month on short months during catch-up", () => {
    const r = catchUpRule({ nextDueDate: "2026-01-31", frequency: "monthly" }, "2026-04-30")
    expect(r.occurrences).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])
    expect(r.nextDueDate).toBe("2026-05-31")
  })

  it("bounds runaway catch-up (corrupt old date)", () => {
    const r = catchUpRule({ nextDueDate: "2000-01-01", frequency: "monthly" }, "2026-08-01")
    expect(r.occurrences).toHaveLength(24)
  })
})
