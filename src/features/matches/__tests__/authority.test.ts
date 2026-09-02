import { describe, expect, it } from "vitest"

import {
  canClaimOpponentSide,
  canLogMatchEvents,
  canAssignRecorder,
  isCaptainRole,
  rosterOpen,
  hasFreeSpot,
  formatKickoffLabel,
  sideOfCaptain,
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

describe("sideOfCaptain", () => {
  const captainId = "11111111-1111-4111-8111-111111111111"
  const awayCaptainId = "22222222-2222-4222-8222-222222222222"
  const someoneElse = "33333333-3333-4333-8333-333333333333"

  it("resolves the creator to home", () => {
    expect(sideOfCaptain(captainId, awayCaptainId, captainId)).toBe("home")
    expect(sideOfCaptain(captainId, null, captainId)).toBe("home")
  })

  it("resolves the opponent-side claimant to away", () => {
    expect(sideOfCaptain(captainId, awayCaptainId, awayCaptainId)).toBe("away")
  })

  it("never resolves away while the side is unclaimed", () => {
    expect(sideOfCaptain(captainId, null, someoneElse)).toBeNull()
  })

  it("returns null for anyone else", () => {
    expect(sideOfCaptain(captainId, awayCaptainId, someoneElse)).toBeNull()
  })
})

describe("canClaimOpponentSide", () => {
  const captainId = "11111111-1111-4111-8111-111111111111"
  const awayCaptainId = "22222222-2222-4222-8222-222222222222"
  const claimant = "33333333-3333-4333-8333-333333333333"

  const base = {
    state: "open",
    captainId,
    awayCaptainId: null,
    userId: claimant,
    onRoster: false,
  }

  it("allows an outside player to claim an open match", () => {
    expect(canClaimOpponentSide(base)).toBe(true)
  })

  it("refuses once the match leaves the open state", () => {
    for (const state of ["confirmed", "ongoing", "completed", "cancelled"]) {
      expect(canClaimOpponentSide({ ...base, state }), state).toBe(false)
    }
  })

  it("refuses when the away side is already claimed", () => {
    expect(canClaimOpponentSide({ ...base, awayCaptainId })).toBe(false)
  })

  it("refuses the match captain", () => {
    expect(canClaimOpponentSide({ ...base, userId: captainId })).toBe(false)
  })

  it("refuses players already on the roster", () => {
    expect(canClaimOpponentSide({ ...base, onRoster: true })).toBe(false)
  })
})

describe("canLogMatchEvents", () => {
  const userId = "aaaaaaaa-1111-4111-8111-111111111111"
  const recorderId = "bbbbbbbb-2222-4222-8222-222222222222"

  it("allows a side captain (side already resolved by the caller)", () => {
    expect(
      canLogMatchEvents({ side: "home", recorderId: null, userId })
    ).toBe(true)
    expect(
      canLogMatchEvents({ side: "away", recorderId: null, userId })
    ).toBe(true)
  })

  it("allows the assigned recorder", () => {
    expect(
      canLogMatchEvents({ side: null, recorderId, userId: recorderId })
    ).toBe(true)
  })

  it("refuses everyone else", () => {
    expect(
      canLogMatchEvents({ side: null, recorderId, userId })
    ).toBe(false)
    expect(canLogMatchEvents({ side: null, recorderId: null, userId })).toBe(
      false
    )
    expect(
      canLogMatchEvents({ side: null, recorderId: null, userId: recorderId })
    ).toBe(false)
  })
})

describe("canAssignRecorder", () => {
  it("allows either side's captain only", () => {
    expect(canAssignRecorder({ side: "home" })).toBe(true)
    expect(canAssignRecorder({ side: "away" })).toBe(true)
    expect(canAssignRecorder({ side: null })).toBe(false)
  })
})
