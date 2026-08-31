import { describe, expect, it } from "vitest"

import {
  mergeMatchHistory,
  type GuestHistoryRow,
  type PlayerHistoryRow,
} from "../history"

const MATCH_ID = "3f2e3d4c-5b6a-4789-9a0b-cdef12345678"
const OTHER_ID = "4f2e3d4c-5b6a-4789-9a0b-cdef12345678"

function playerRow(overrides: Partial<PlayerHistoryRow> = {}): PlayerHistoryRow {
  return {
    matchId: MATCH_ID,
    state: "completed",
    matchType: "fives",
    homeScore: 3,
    awayScore: 1,
    date: "2026-08-01",
    slotStart: "19:00:00",
    turfName: "Turf A",
    playedConfirmedAt: new Date("2026-08-01T21:00:00Z"),
    kickoffAt: new Date("2026-08-01T13:00:00Z"),
    ...overrides,
  }
}

function guestRow(overrides: Partial<GuestHistoryRow> = {}): GuestHistoryRow {
  return {
    matchId: MATCH_ID,
    state: "completed",
    matchType: "fives",
    homeScore: 3,
    awayScore: 1,
    date: "2026-08-01",
    slotStart: "19:00:00",
    turfName: "Turf A",
    kickoffAt: new Date("2026-08-01T13:00:00Z"),
    ...overrides,
  }
}

describe("mergeMatchHistory", () => {
  it("returns [] for empty inputs", () => {
    expect(mergeMatchHistory([], [], 20)).toEqual([])
  })

  it("keeps a guest-only match with asGuest and no confirmation", () => {
    const rows = mergeMatchHistory([], [guestRow()], 20)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: MATCH_ID, asGuest: true, playedConfirmedAt: null })
  })

  it("the rostered row wins when both sources have the match", () => {
    const rows = mergeMatchHistory([playerRow()], [guestRow()], 20)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.asGuest).toBe(false)
    expect(rows[0]?.playedConfirmedAt).not.toBeNull()
  })

  it("dedupes multiple guest rows for the same match", () => {
    const rows = mergeMatchHistory(
      [],
      [guestRow(), guestRow({ turfName: "Turf B" })],
      20
    )
    expect(rows).toHaveLength(1)
  })

  it("sorts by kickoff descending", () => {
    const rows = mergeMatchHistory(
      [],
      [
        guestRow({ matchId: MATCH_ID, kickoffAt: new Date("2026-08-01T13:00:00Z") }),
        guestRow({ matchId: OTHER_ID, kickoffAt: new Date("2026-08-10T13:00:00Z") }),
      ],
      20
    )
    expect(rows.map((r) => r.id)).toEqual([OTHER_ID, MATCH_ID])
  })

  it("sorts matches without kickoff last, by slot descending", () => {
    const rows = mergeMatchHistory(
      [],
      [
        guestRow({ kickoffAt: null, date: "2026-07-01", slotStart: "18:00:00" }),
        guestRow({ matchId: OTHER_ID, kickoffAt: new Date("2026-08-10T13:00:00Z") }),
        guestRow({ matchId: "5f2e3d4c-5b6a-4789-9a0b-cdef12345678", kickoffAt: null, date: "2026-07-02", slotStart: "21:00:00" }),
      ],
      20
    )
    expect(rows.map((r) => r.id)).toEqual([
      OTHER_ID,
      "5f2e3d4c-5b6a-4789-9a0b-cdef12345678",
      MATCH_ID,
    ])
  })

  it("applies the limit after merging", () => {
    const rows = mergeMatchHistory(
      [playerRow({ matchId: MATCH_ID })],
      [guestRow({ matchId: OTHER_ID, kickoffAt: new Date("2026-08-10T13:00:00Z") })],
      1
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(OTHER_ID) // the newer kickoff survives the cut
  })
})
