import { describe, expect, it } from "vitest"

import {
  formatDistanceKm,
  matchesViewUrl,
  parseMatchesView,
} from "./matches-view"

/** Parse a view URL's query back the way Next.js hands searchParams over. */
function roundTripQuery(url: string): Record<string, string> {
  const qs = url.split("?")[1] ?? ""
  return Object.fromEntries(new URLSearchParams(qs))
}

describe("parseMatchesView", () => {
  it("defaults to kickoff order with no location", () => {
    expect(parseMatchesView({})).toEqual({ sort: "time", coords: null })
  })

  it("keeps a near intent that has no coords yet", () => {
    expect(parseMatchesView({ sort: "near" })).toEqual({
      sort: "near",
      coords: null,
    })
  })

  it("reads coords and near sort from the URL", () => {
    expect(
      parseMatchesView({ sort: "near", lat: "23.8103", lng: "90.4125" })
    ).toEqual({ sort: "near", coords: { lat: 23.81, lng: 90.413 } })
  })

  it("keeps time sort when coords are present without a sort param", () => {
    expect(parseMatchesView({ lat: "23.8", lng: "90.4" })).toEqual({
      sort: "time",
      coords: { lat: 23.8, lng: 90.4 },
    })
  })

  it("rejects junk, partial, and out-of-range coords", () => {
    for (const sp of [
      { lat: "abc", lng: "90.4" },
      { lat: "23.8", lng: "abc" },
      { lat: "23.8" },
      { lng: "90.4" },
      { lat: "95", lng: "90.4" },
      { lat: "23.8", lng: "-200" },
    ]) {
      expect(parseMatchesView(sp).coords).toBeNull()
    }
  })

  it("unknown sort params fall back to time", () => {
    expect(parseMatchesView({ sort: "banana" }).sort).toBe("time")
  })
})

describe("matchesViewUrl", () => {
  it("returns the bare path for the default view", () => {
    expect(matchesViewUrl({ sort: "time", coords: null })).toBe("/matches")
  })

  it("carries coords without a sort param in time sort", () => {
    expect(
      matchesViewUrl({ sort: "time", coords: { lat: 23.81, lng: 90.413 } })
    ).toBe("/matches?lat=23.810&lng=90.413")
  })

  it("carries the full near view", () => {
    expect(
      matchesViewUrl({ sort: "near", coords: { lat: 23.81, lng: 90.413 } })
    ).toBe("/matches?lat=23.810&lng=90.413&sort=near")
  })

  it("round-trips every view shape", () => {
    const views = [
      { sort: "time" as const, coords: null },
      { sort: "near" as const, coords: null },
      { sort: "time" as const, coords: { lat: 23.81, lng: 90.413 } },
      { sort: "near" as const, coords: { lat: -23.81, lng: -90.413 } },
    ]
    for (const view of views) {
      expect(parseMatchesView(roundTripQuery(matchesViewUrl(view)))).toEqual(
        view
      )
    }
  })
})

describe("formatDistanceKm", () => {
  it("formats western digits for en", () => {
    expect(formatDistanceKm(1.84, "en")).toBe("1.8 km")
  })

  it("converts digits for bn, keeping the km unit", () => {
    expect(formatDistanceKm(1.84, "bn")).toBe("১.৮ km")
  })
})
