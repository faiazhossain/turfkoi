import { describe, expect, it } from "vitest"

import { areaSearchUrl, filterAreas } from "./area-search"
import type { TurfAreaOption } from "@/features/turfs/queries"

/** Read the `area` param back the way Next.js parses searchParams. */
function roundTrip(url: string): string | null {
  const qs = url.split("?")[1] ?? ""
  return new URLSearchParams(qs).get("area")
}

describe("areaSearchUrl", () => {
  it("clears all filters for an empty query", () => {
    expect(areaSearchUrl("")).toBe("/turfs")
    expect(areaSearchUrl("   ")).toBe("/turfs")
  })

  it("builds an area search URL", () => {
    expect(areaSearchUrl("Dhanmondi")).toBe("/turfs?area=Dhanmondi")
  })

  it("trims the query", () => {
    expect(areaSearchUrl("  Dhanmondi ")).toBe("/turfs?area=Dhanmondi")
  })

  it("encodes spaces like the old GET form did (+, not %20)", () => {
    expect(areaSearchUrl("Gulshan 1")).toBe("/turfs?area=Gulshan+1")
  })

  it("round-trips multi-word and non-ASCII area names", () => {
    for (const area of ["Gulshan 2, Dhaka", "Bashundhara R/A", "বসুন্ধরা"]) {
      expect(roundTrip(areaSearchUrl(area))).toBe(area)
    }
  })
})

describe("filterAreas", () => {
  const areas: TurfAreaOption[] = [
    { area: "Bashundhara R/A", city: "Dhaka" },
    { area: "Dhanmondi", city: "Dhaka" },
    { area: "Gulshan 1", city: "Dhaka" },
    { area: "Uttara", city: "Dhaka" },
  ]

  it("lists every available area for an empty query", () => {
    expect(filterAreas(areas, "")).toEqual(areas)
    expect(filterAreas(areas, "   ")).toEqual(areas)
  })

  it("matches case-insensitively and trims the query", () => {
    expect(filterAreas(areas, "  dhanmondi ")).toEqual([
      { area: "Dhanmondi", city: "Dhaka" },
    ])
  })

  it("subtraction never invents areas: unknown places match nothing", () => {
    expect(filterAreas(areas, "Mirpur")).toEqual([])
  })

  it("ranks prefix matches before substring matches", () => {
    const mixed: TurfAreaOption[] = [
      { area: "Uttara Sector 4", city: null },
      { area: "Banani Uttara Link", city: null },
    ]
    expect(filterAreas(mixed, "uttara").map((a) => a.area)).toEqual([
      "Uttara Sector 4",
      "Banani Uttara Link",
    ])
  })

  it("caps the number of suggestions", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      area: `Area ${i}`,
      city: null,
    }))
    expect(filterAreas(many, "").length).toBe(8)
    expect(filterAreas(many, "", 3).length).toBe(3)
  })
})
