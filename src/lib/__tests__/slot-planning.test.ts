import { describe, it, expect } from "vitest"

import {
  normalizeHHMM,
  planMaterialization,
  type ExistingSlotRow,
} from "@/lib/slot-planning"
import type { DatedSlotDraft } from "@/lib/slot-expansion"

function existing(overrides: Partial<ExistingSlotRow> = {}): ExistingSlotRow {
  return {
    date: "2026-03-06",
    startTime: "18:00",
    durationMinutes: 60,
    price: 1000,
    status: "available",
    source: "template",
    ...overrides,
  }
}

function desired(overrides: Partial<DatedSlotDraft> = {}): DatedSlotDraft {
  return {
    date: "2026-03-06",
    startTime: "18:00",
    durationMinutes: 60,
    price: 1000,
    ...overrides,
  }
}

describe("normalizeHHMM", () => {
  it("strips Postgres trailing seconds", () => {
    expect(normalizeHHMM("18:00:00")).toBe("18:00")
    expect(normalizeHHMM("18:00")).toBe("18:00")
  })

  it("rejects unexpected shapes", () => {
    expect(() => normalizeHHMM("garbage")).toThrow()
  })
})

describe("planMaterialization", () => {
  it("marks matching rows unchanged and emits nothing", () => {
    const plan = planMaterialization(
      [existing()],
      [desired()]
    )
    expect(plan).toMatchObject({
      inserts: [],
      updates: [],
      deletes: [],
      conflicts: [],
      unchanged: 1,
    })
  })

  it("updates available template rows whose price drifted", () => {
    const plan = planMaterialization(
      [existing({ price: 800 })],
      [desired({ price: 1200 })]
    )
    expect(plan.updates).toEqual([desired({ price: 1200 })])
    expect(plan.conflicts).toEqual([])
  })

  it("resizes available template rows when no kept slot is nearby", () => {
    const plan = planMaterialization(
      [existing({ durationMinutes: 60 })],
      [desired({ durationMinutes: 90 })]
    )
    expect(plan.updates[0]?.durationMinutes).toBe(90)
  })

  it("deletes available template rows the schedule no longer offers", () => {
    const plan = planMaterialization(
      [existing(), existing({ startTime: "19:00" })],
      [desired()]
    )
    expect(plan.deletes).toEqual([{ date: "2026-03-06", startTime: "19:00" }])
  })

  it("inserts new slots that nothing occupies", () => {
    const plan = planMaterialization(
      [existing()],
      [desired(), desired({ startTime: "20:00", price: 1200 })]
    )
    expect(plan.inserts).toEqual([desired({ startTime: "20:00", price: 1200 })])
  })

  it("never touches manual rows, inside or outside the plan", () => {
    const plan = planMaterialization(
      [
        existing({ startTime: "18:00", source: "manual", price: 500 }),
        existing({ startTime: "21:00", source: "manual" }),
      ],
      [desired()]
    )
    expect(plan.updates).toEqual([])
    expect(plan.deletes).toEqual([])
    expect(plan.keptManual).toBe(2)
  })

  it("reports a duration mismatch on a manual slot instead of resizing", () => {
    const plan = planMaterialization(
      [existing({ source: "manual", durationMinutes: 45 })],
      [desired({ durationMinutes: 60 })]
    )
    expect(plan.updates).toEqual([])
    expect(plan.conflicts[0]).toContain("custom slot")
    expect(plan.conflicts[0]).toContain("45")
  })

  it("keeps a booked slot matching the plan without conflict", () => {
    const plan = planMaterialization(
      [existing({ status: "booked" })],
      [desired()]
    )
    expect(plan.conflicts).toEqual([])
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it("reports a booked slot the schedule no longer offers", () => {
    const plan = planMaterialization([existing({ status: "booked" })], [])
    expect(plan.deletes).toEqual([])
    expect(plan.conflicts[0]).toContain("active booking")
    expect(plan.conflicts[0]).toContain("outside the new schedule")
  })

  it("reports a booked slot whose duration no longer matches", () => {
    const plan = planMaterialization(
      [existing({ status: "held", durationMinutes: 90 })],
      [desired({ durationMinutes: 60 })]
    )
    expect(plan.conflicts[0]).toContain("active booking")
    expect(plan.updates).toEqual([])
  })

  it("refuses to resize an available row into a neighboring booking", () => {
    // 18:00 available template row; 19:00 booked. Schedule now wants
    // 18:00/90 — that would run until 19:30, over the 19:00 booking.
    const plan = planMaterialization(
      [
        existing({ startTime: "18:00" }),
        existing({ startTime: "19:00", status: "booked" }),
      ],
      [
        desired({ startTime: "18:00", durationMinutes: 90 }),
        desired({ startTime: "20:30", durationMinutes: 90 }),
      ]
    )
    expect(plan.updates).toEqual([])
    expect(plan.inserts.map((i) => i.startTime)).toEqual(["20:30"])
    expect(
      plan.conflicts.some((c) => c.includes("18:00") && c.includes("not resized"))
    ).toBe(true)
  })

  it("refuses to insert a slot overlapping a kept slot", () => {
    // Manual 20:00/90 stays; schedule wants 20:30 — overlap.
    const plan = planMaterialization(
      [existing({ startTime: "20:00", durationMinutes: 90, source: "manual" })],
      [desired({ startTime: "20:30" })]
    )
    expect(plan.inserts).toEqual([])
    expect(plan.conflicts[0]).toContain("would overlap a kept slot")
  })

  it("keeps maintenance and blocked template rows outside the plan", () => {
    const plan = planMaterialization(
      [
        existing({ startTime: "18:00", status: "maintenance" }),
        existing({ startTime: "19:00", status: "blocked" }),
      ],
      []
    )
    expect(plan.deletes).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it("does not double-book when midnight spillover collides next date", () => {
    // Desired 00:30 on Mar 7 (from a Mar 6 wrap section); a booked 00:30
    // row exists on Mar 7 — same key path, treated as kept with duration
    // matching, so no insert and no conflict.
    const plan = planMaterialization(
      [existing({ date: "2026-03-07", startTime: "00:30", status: "booked" })],
      [desired({ date: "2026-03-07", startTime: "00:30" })]
    )
    expect(plan.inserts).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it("normalizes Postgres HH:mm:ss start times on both sides", () => {
    const plan = planMaterialization(
      [existing({ startTime: "18:00:00" })],
      [desired()]
    )
    expect(plan.unchanged).toBe(1)
    expect(plan.deletes).toEqual([])
  })

  it("reports a booked row not in the plan exactly once", () => {
    const plan = planMaterialization(
      [existing({ status: "booked", startTime: "18:00" })],
      [desired({ startTime: "20:00" })]
    )
    const conflictCount = plan.conflicts.filter((c) =>
      c.includes("18:00")
    ).length
    expect(conflictCount).toBe(1)
  })
})
