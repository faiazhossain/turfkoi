import { describe, expect, it } from "vitest"

import { OVER_INVITE_BUFFER, maxPendingInvitations, spotsLeft } from "../formats"

/**
 * Invitation capacity invariants: pending invitations are PROSPECTS, not
 * reservations — they never shrink a side's open seats. Seats are claimed
 * first-accept-wins at accept time (atomic row-lock + conditional insert in
 * the server actions, not unit-testable here), so the math only ever counts
 * claimed seats: roster + guests + declared placeholders. A side may hold
 * more pending invites than open seats (maxPendingInvitations) so ignored
 * invites can't lock the captain out.
 */
describe("invitation capacity", () => {
  const squadSize = 10

  it("pending invites never reduce the open seats", () => {
    // There is no pending argument left to pass — outstanding invitations
    // simply don't exist in the seat math.
    expect(spotsLeft(squadSize, 7)).toBe(3)
  })

  it("a full squad has no open seats regardless of invites", () => {
    expect(spotsLeft(squadSize, squadSize)).toBe(0)
    // A pending invite next to one open seat keeps that seat open.
    expect(spotsLeft(squadSize, 9)).toBe(1)
  })

  it("a decline removes a prospect; the seat math never changed", () => {
    expect(spotsLeft(squadSize, 7)).toBe(3)
  })

  it("an accept converts a prospect into a claimed seat", () => {
    // 7 accepted + 1 accepting → the atomic claim must see one fewer seat:
    expect(spotsLeft(squadSize, 8)).toBe(2)
  })

  it("guests count as claimed squad members", () => {
    // 6 players + 2 guests in a 10-squad → 2 seats left.
    expect(spotsLeft(squadSize, 6 + 2)).toBe(2)
  })

  it("declared placeholders consume seats (count-first)", () => {
    // 7 named + 3 un-named placeholders of a 10-player squad → full.
    expect(spotsLeft(squadSize, 7, 3)).toBe(0)
  })

  it("sides are independent: one side's fill never shrinks the other", () => {
    // Person-based sides share the squadSize per side, not between sides —
    // a nearly-full home side leaves the away side's full budget intact.
    expect(spotsLeft(squadSize, 9)).toBe(1)
    expect(spotsLeft(squadSize, 0)).toBe(squadSize)
  })
})

describe("over-invite budget", () => {
  it("allows the buffer the product asked for: need 1 -> invite 4", () => {
    expect(OVER_INVITE_BUFFER).toBe(3)
    expect(maxPendingInvitations(1)).toBe(4)
  })

  it("scales with open seats", () => {
    expect(maxPendingInvitations(3)).toBe(6)
    expect(maxPendingInvitations(12)).toBe(15)
  })

  it("a side with no open seats takes no new invites", () => {
    expect(maxPendingInvitations(0)).toBe(0)
  })
})
