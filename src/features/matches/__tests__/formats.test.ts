import { describe, expect, it } from "vitest"

import {
  FORMATS,
  MATCH_FORMATS,
  defaultSquadSize,
  isMatchFormat,
  isValidSquadSize,
  placeholdersUpperBound,
  resolveSquadRole,
  spotsLeft,
  startersOf,
} from "../formats"

describe("FORMATS", () => {
  it("covers all four formats with valid bounds", () => {
    expect(MATCH_FORMATS).toEqual(["fives", "sevens", "nines", "elevens"])
    for (const f of MATCH_FORMATS) {
      expect(FORMATS[f].maxSquad).toBeGreaterThan(FORMATS[f].starters)
    }
  })
})

describe("isValidSquadSize", () => {
  it("accepts sizes from starters to maxSquad", () => {
    expect(isValidSquadSize("fives", 5)).toBe(true)
    expect(isValidSquadSize("fives", 8)).toBe(true)
    expect(isValidSquadSize("fives", 12)).toBe(true)
    expect(isValidSquadSize("elevens", 11)).toBe(true)
    expect(isValidSquadSize("elevens", 18)).toBe(true)
  })

  it("rejects sizes below starters or above maxSquad", () => {
    // 7v7 does NOT mean a 7-player cap — but a squad smaller than the
    // starting lineup is invalid.
    expect(isValidSquadSize("fives", 4)).toBe(false)
    expect(isValidSquadSize("fives", 13)).toBe(false)
    expect(isValidSquadSize("elevens", 10)).toBe(false)
    expect(isValidSquadSize("elevens", 19)).toBe(false)
  })

  it("rejects non-integers", () => {
    expect(isValidSquadSize("sevens", 8.5)).toBe(false)
    expect(isValidSquadSize("sevens", Number.NaN)).toBe(false)
  })
})

describe("resolveSquadRole", () => {
  it("seats starting while the starting group has room", () => {
    expect(resolveSquadRole(0, "sevens")).toBe("starting")
    expect(resolveSquadRole(6, "sevens")).toBe("starting")
  })

  it("benches once starters are full", () => {
    expect(resolveSquadRole(7, "sevens")).toBe("substitute")
    expect(resolveSquadRole(12, "sevens")).toBe("substitute")
  })
})

describe("spotsLeft", () => {
  it("subtracts accepted and pending, never negative", () => {
    expect(spotsLeft(10, 7, 2)).toBe(1)
    expect(spotsLeft(10, 10, 0)).toBe(0)
    expect(spotsLeft(10, 9, 3)).toBe(0)
  })

  it("defaults pending to zero", () => {
    expect(spotsLeft(12, 4)).toBe(8)
  })

  it("placeholder seats consume spots (count-first)", () => {
    // 7 named + 3 un-named placeholders of a 10-player squad → full.
    expect(spotsLeft(10, 7, 0, 3)).toBe(0)
    // Placeholders + pending together with identities can't exceed the squad.
    expect(spotsLeft(10, 5, 2, 3)).toBe(0)
    expect(spotsLeft(10, 5, 1, 3)).toBe(1)
  })

  it("full-squad declaration leaves no spots", () => {
    expect(spotsLeft(10, 0, 0, 10)).toBe(0)
  })
})

describe("placeholdersUpperBound", () => {
  it("is the seats nobody claims yet", () => {
    expect(placeholdersUpperBound(10, 7, 2)).toBe(1)
    expect(placeholdersUpperBound(10, 0, 0)).toBe(10)
  })

  it("never negative and zero when the squad is claimed", () => {
    expect(placeholdersUpperBound(10, 10, 2)).toBe(0)
    expect(placeholdersUpperBound(8, 8)).toBe(0)
  })
})

describe("helpers", () => {
  it("startersOf and defaultSquadSize agree with FORMATS", () => {
    expect(startersOf("fives")).toBe(5)
    expect(defaultSquadSize("fives")).toBe(8) // min(5+3, 12)
    expect(defaultSquadSize("elevens")).toBe(14)
  })

  it("isMatchFormat guards unknown values", () => {
    expect(isMatchFormat("sevens")).toBe(true)
    expect(isMatchFormat("twelves")).toBe(false)
  })
})
