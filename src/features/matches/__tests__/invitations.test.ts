import { describe, expect, it } from "vitest"

import { spotsLeft } from "../formats"

/**
 * Invitation capacity invariants (Phase 2): pending invitations CONSUME a
 * squad spot until they are answered — accepting inserts the player, so the
 * math must never allow roster + guests + pending to exceed squadSize.
 */
describe("invitation capacity", () => {
  const squadSize = 10

  it("pending invites reduce the free spots", () => {
    expect(spotsLeft(squadSize, 7, 2)).toBe(1)
    expect(spotsLeft(squadSize, 7, 3)).toBe(0)
  })

  it("a full squad cannot take more invites", () => {
    expect(spotsLeft(squadSize, squadSize, 0)).toBe(0)
    expect(spotsLeft(squadSize, 9, 1)).toBe(0)
  })

  it("a decline releases the held spot", () => {
    // 7 accepted, 3 pending — one declines:
    expect(spotsLeft(squadSize, 7, 2)).toBe(1)
  })

  it("an accept converts a held spot into a roster row (no overfill)", () => {
    // 7 accepted, 3 pending, one accepts → 8 accepted, 2 pending:
    expect(spotsLeft(squadSize, 8, 2)).toBe(0)
  })

  it("accepting recheck ignores only the invitee's own held spot", () => {
    // The invitee's invitation is one of the pending; the others still hold:
    const accepted = 7
    const pending = 3
    const ownHeld = 1
    const freeAtAccept = spotsLeft(squadSize, accepted, pending - ownHeld)
    expect(freeAtAccept).toBe(1)
    // Held spots make overfill impossible: the last invitee can always
    // claim their own spot (accepted + pending never exceeds squadSize).
    const lastInvitee = spotsLeft(squadSize, 9, 1 - ownHeld)
    expect(lastInvitee).toBe(1)
    expect(9 + 1).toBe(squadSize)
  })

  it("guests count as accepted squad members", () => {
    // 6 players + 2 guests + 1 pending invite in a 10-squad → 1 left.
    expect(spotsLeft(squadSize, 6 + 2, 1)).toBe(1)
  })
})
