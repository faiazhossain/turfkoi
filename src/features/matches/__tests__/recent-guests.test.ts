import { describe, expect, it } from "vitest"

import { dedupeRecentGuests, type RecentGuestPick } from "../guests"

function pick(overrides: Partial<RecentGuestPick> = {}): RecentGuestPick {
  return {
    name: "Rakib",
    phone: null,
    position: null,
    jerseyNumber: null,
    ...overrides,
  }
}

/** Rows must arrive newest-first — helpers here keep that contract visible. */
function newestFirst(rows: RecentGuestPick[]): RecentGuestPick[] {
  return rows
}

describe("dedupeRecentGuests", () => {
  it("dedupes by normalized phone regardless of input formatting", () => {
    const rows = newestFirst([
      pick({ name: "Rakib", phone: "+8801712345678", jerseyNumber: 7 }),
      pick({ name: "rakib", phone: "01712345678" }),
    ])
    const result = dedupeRecentGuests(rows, 8)
    expect(result).toHaveLength(1)
    expect(result[0]?.jerseyNumber).toBe(7) // newest row wins
  })

  it("falls back to the trimmed lowercase name when there is no phone", () => {
    const rows = newestFirst([
      pick({ name: "  Rakib " }),
      pick({ name: "rakib", position: "striker" }),
    ])
    const result = dedupeRecentGuests(rows, 8)
    expect(result).toHaveLength(1)
    expect(result[0]?.position).toBeNull() // first (newest) occurrence wins
  })

  it("keeps distinct people apart", () => {
    const rows = newestFirst([
      pick({ name: "Rakib", phone: "+8801712345678" }),
      pick({ name: "Hasan" }),
      pick({ name: "Rakib", phone: "+8801812345678" }),
    ])
    expect(dedupeRecentGuests(rows, 8)).toHaveLength(3)
  })

  it("applies the limit after deduping", () => {
    const rows = newestFirst([
      pick({ name: "A" }),
      pick({ name: "a" }), // duplicate of A
      pick({ name: "B" }),
      pick({ name: "C" }),
    ])
    const result = dedupeRecentGuests(rows, 2)
    expect(result.map((r) => r.name)).toEqual(["A", "B"])
  })

  it("returns [] for empty input", () => {
    expect(dedupeRecentGuests([], 8)).toEqual([])
  })
})
