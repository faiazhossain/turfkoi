import { describe, expect, it } from "vitest"

import { findSectionConflicts } from "@/lib/slot-expansion"
import { buildWizardSections, type WizardValues } from "@/lib/wizard-sections"

function values(overrides: Partial<WizardValues> = {}): WizardValues {
  return {
    pricing: "flat",
    flatPrice: 800,
    peakFrom: "17:00",
    peakTo: "23:00",
    peakPrice: 1200,
    offPeakPrice: 800,
    openFrom: "07:00",
    openTo: "23:00",
    slotMinutes: 90,
    gapMinutes: 10,
    breakEnabled: false,
    breakFrom: "12:00",
    breakTo: "14:30",
    breakDays: [0, 1, 2, 3, 4, 5, 6],
    ...overrides,
  }
}

function daySections(sections: ReturnType<typeof buildWizardSections>, day: number) {
  return sections.filter((s) => s.dayOfWeek === day)
}

describe("buildWizardSections", () => {
  it("flat pricing without break makes one section per day", () => {
    const sections = buildWizardSections(values())
    expect(sections).toHaveLength(7)
    expect(sections[0]).toMatchObject({
      dayOfWeek: 0,
      label: undefined,
      startTime: "07:00",
      endTime: "23:00",
      price: 800,
      slotMinutes: 90,
      gapMinutes: 10,
    })
    expect(findSectionConflicts(sections)).toEqual([])
  })

  it("peak pricing splits each day into off-peak and peak", () => {
    const sections = buildWizardSections(values({ pricing: "peak" }))
    expect(sections).toHaveLength(14)
    const monday = daySections(sections, 1)
    expect(monday).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Off-peak",
          startTime: "07:00",
          endTime: "17:00",
          price: 800,
        }),
        expect.objectContaining({
          label: "Peak",
          startTime: "17:00",
          endTime: "23:00",
          price: 1200,
        }),
      ])
    )
    expect(findSectionConflicts(sections)).toEqual([])
  })

  it("a break subtracts from the day and splits around it", () => {
    const sections = buildWizardSections(
      values({ pricing: "peak", breakEnabled: true })
    )
    const monday = daySections(sections, 1)
    expect(monday.map((s) => [s.label, s.startTime, s.endTime])).toEqual([
      ["Off-peak", "07:00", "12:00"],
      ["Off-peak", "14:30", "17:00"],
      ["Peak", "17:00", "23:00"],
    ])
  })

  it("a break only on Friday leaves other days untouched", () => {
    const sections = buildWizardSections(
      values({ breakEnabled: true, breakDays: [5] })
    )
    expect(daySections(sections, 5)).toHaveLength(2)
    expect(daySections(sections, 4)).toHaveLength(1)
    expect(daySections(sections, 5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startTime: "07:00", endTime: "12:00" }),
        expect.objectContaining({ startTime: "14:30", endTime: "23:00" }),
      ])
    )
  })

  it("a break covering the entire off-peak morning drops it", () => {
    const sections = buildWizardSections(
      values({
        pricing: "peak",
        breakEnabled: true,
        breakFrom: "07:00",
        breakTo: "17:00",
      })
    )
    const monday = daySections(sections, 1)
    expect(monday).toHaveLength(1)
    expect(monday[0]).toMatchObject({
      label: "Peak",
      startTime: "17:00",
      endTime: "23:00",
    })
  })

  it("a break covering the whole day yields no sections for that day", () => {
    const sections = buildWizardSections(
      values({
        breakEnabled: true,
        breakFrom: "00:00",
        breakTo: "23:59",
        breakDays: [3],
      })
    )
    expect(daySections(sections, 3)).toHaveLength(0)
    expect(daySections(sections, 2)).toHaveLength(1)
  })

  it("a peak window wider than open hours clamps to open hours", () => {
    const sections = buildWizardSections(
      values({ pricing: "peak", peakFrom: "05:00", peakTo: "23:59" })
    )
    const monday = daySections(sections, 1)
    expect(monday).toHaveLength(1)
    expect(monday[0]).toMatchObject({
      label: "Peak",
      startTime: "07:00",
      endTime: "23:00",
      price: 1200,
    })
  })

  it("a peak window outside open hours makes the whole day off-peak", () => {
    const sections = buildWizardSections(
      values({ pricing: "peak", peakFrom: "23:30", peakTo: "23:45" })
    )
    const monday = daySections(sections, 1)
    expect(monday).toHaveLength(1)
    expect(monday[0]).toMatchObject({ label: "Off-peak", price: 800 })
  })

  it("wrapping open hours (Ramadan nights) produce wrapped sections", () => {
    const sections = buildWizardSections(
      values({
        openFrom: "20:00",
        openTo: "02:00",
        pricing: "peak",
        peakFrom: "22:00",
        peakTo: "02:00",
      })
    )
    const monday = daySections(sections, 1)
    expect(monday.map((s) => [s.label, s.startTime, s.endTime])).toEqual([
      ["Off-peak", "20:00", "22:00"],
      // Wrapped section: endTime <= startTime is the system's wrap encoding.
      ["Peak", "22:00", "02:00"],
    ])
    expect(findSectionConflicts(sections)).toEqual([])
  })
})
