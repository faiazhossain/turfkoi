import { describe, expect, it } from "vitest"

import {
  isCaptainRole,
  rosterOpen,
  hasFreeSpot,
  formatKickoffLabel,
  ROSTER_OPEN_STATES,
} from "../authority"

describe("isCaptainRole", () => {
  it("accepts owner and captain", () => {
    expect(isCaptainRole("owner")).toBe(true)
    expect(isCaptainRole("captain")).toBe(true)
  })

  it("rejects every other team role and absence", () => {
    expect(isCaptainRole("manager")).toBe(false)
    expect(isCaptainRole("player")).toBe(false)
    expect(isCaptainRole("member")).toBe(false)
    expect(isCaptainRole(null)).toBe(false)
    expect(isCaptainRole(undefined)).toBe(false)
  })
})

describe("rosterOpen", () => {
  it("is open exactly in the roster-open states", () => {
    for (const state of ROSTER_OPEN_STATES) {
      expect(rosterOpen(state), state).toBe(true)
    }
  })

  it("is closed once the match is past roster building", () => {
    expect(rosterOpen("ready")).toBe(false)
    expect(rosterOpen("ongoing")).toBe(false)
    expect(rosterOpen("completed")).toBe(false)
    expect(rosterOpen("cancelled")).toBe(false)
    expect(rosterOpen("expired")).toBe(false)
    expect(rosterOpen("draft")).toBe(false)
  })
})

describe("hasFreeSpot", () => {
  it("counts below the max as free", () => {
    expect(hasFreeSpot(0, 8)).toBe(true)
    expect(hasFreeSpot(7, 8)).toBe(true)
  })

  it("is full at and past the max", () => {
    expect(hasFreeSpot(8, 8)).toBe(false)
    expect(hasFreeSpot(9, 8)).toBe(false)
  })
})

describe("formatKickoffLabel", () => {
  it("formats an ISO timestamp as date • time (UTC)", () => {
    expect(formatKickoffLabel("2026-08-30T14:00:00.000Z")).toBe(
      "2026-08-30 • 14:00"
    )
  })

  it("pads single-digit months, days, and minutes", () => {
    expect(formatKickoffLabel("2026-01-05T09:07:00.000Z")).toBe(
      "2026-01-05 • 09:07"
    )
  })

  it("returns null for missing or invalid input", () => {
    expect(formatKickoffLabel(null)).toBeNull()
    expect(formatKickoffLabel(undefined)).toBeNull()
    expect(formatKickoffLabel("not-a-date")).toBeNull()
  })
})
