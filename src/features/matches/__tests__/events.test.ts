import { describe, expect, it } from "vitest"

import {
  aggregateMatchEvents,
  matchMinute,
  parsePlayerRef,
} from "../events"

describe("parsePlayerRef", () => {
  const uuid = "2f2e3d4c-5b6a-4789-9a0b-cdef12345678"

  it("parses registered-player and guest refs", () => {
    expect(parsePlayerRef(`p-${uuid}`)).toEqual({ kind: "player", id: uuid })
    expect(parsePlayerRef(`g-${uuid}`)).toEqual({ kind: "guest", id: uuid })
  })

  it("rejects malformed refs", () => {
    for (const bad of [
      "",
      "x-" + uuid,
      "p",
      "p-",
      "p-not-a-uuid",
      `P-${uuid.toUpperCase()}`,
      `p-${uuid}-extra`,
    ]) {
      expect(parsePlayerRef(bad)).toBeNull()
    }
  })
})

describe("matchMinute", () => {
  const kickoff = new Date("2026-09-02T12:00:00Z")

  it("returns null without a kickoff", () => {
    expect(matchMinute(null)).toBeNull()
  })

  it("floors elapsed minutes since kickoff", () => {
    expect(matchMinute(kickoff, new Date("2026-09-02T12:34:59Z"))).toBe(34)
    expect(matchMinute(kickoff, new Date("2026-09-02T12:35:00Z"))).toBe(35)
  })

  it("clamps an early start to 0", () => {
    expect(matchMinute(kickoff, new Date("2026-09-02T11:50:00Z"))).toBe(0)
  })
})

describe("aggregateMatchEvents", () => {
  const base = { playerName: "Rakib" as string | null }

  it("tallies per side and per player", () => {
    const stats = aggregateMatchEvents([
      { ...base, side: "home", eventType: "goal" },
      { ...base, side: "home", eventType: "goal" },
      { ...base, side: "home", eventType: "tackle" },
      { playerName: "Sajid", side: "away", eventType: "goal" },
      { playerName: "Sajid", side: "away", eventType: "save" },
    ])
    expect(stats.home).toEqual({ goal: 2, save: 0, tackle: 1 })
    expect(stats.away).toEqual({ goal: 1, save: 1, tackle: 0 })
    expect(stats.players).toEqual([
      { name: "Rakib", side: "home", goal: 2, save: 0, tackle: 1 },
      { name: "Sajid", side: "away", goal: 1, save: 1, tackle: 0 },
    ])
  })

  it("ignores notes and player-less events", () => {
    const stats = aggregateMatchEvents([
      { playerName: null, side: null, eventType: "note" },
      { ...base, side: null, eventType: "goal" },
      // A side-tagged stat still counts the side tally without a name.
      { playerName: null, side: "home", eventType: "save" },
    ])
    expect(stats.home).toEqual({ goal: 0, save: 1, tackle: 0 })
    expect(stats.away).toEqual({ goal: 0, save: 0, tackle: 0 })
    expect(stats.players).toEqual([])
  })

  it("ranks players by goal, then save, then tackle", () => {
    const stats = aggregateMatchEvents([
      { playerName: "A", side: "home", eventType: "tackle" },
      { playerName: "B", side: "home", eventType: "save" },
      { playerName: "C", side: "away", eventType: "goal" },
      { playerName: "D", side: "home", eventType: "goal" },
    ])
    expect(stats.players.map((p) => p.name)).toEqual(["C", "D", "B", "A"])
  })
})
