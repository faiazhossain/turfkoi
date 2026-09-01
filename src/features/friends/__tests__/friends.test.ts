import { describe, expect, it } from "vitest"

import {
  filterBlockedInvitees,
  requestSendBlocker,
  resolveFriendshipState,
  type FriendshipRowLike,
} from "../state"

/**
 * Friendship + blocks state machine (Player Network). The DB returns an
 * optional row + a block flag; everything the UI and actions decide hangs
 * off this pure resolution so every edge stays testable.
 */
const ME = "u-me"
const OTHER = "u-other"

function row(
  status: FriendshipRowLike["status"],
  requesterId: string,
  addresseeId: string
): FriendshipRowLike {
  return { id: "f-1", status, requesterId, addresseeId }
}

describe("resolveFriendshipState", () => {
  it("self never depends on rows or blocks", () => {
    expect(resolveFriendshipState(ME, ME, null, false)).toBe("self")
    expect(resolveFriendshipState(ME, ME, row("accepted", ME, ME), true)).toBe("self")
  })

  it("no row and no block is none", () => {
    expect(resolveFriendshipState(ME, OTHER, null, false)).toBe("none")
  })

  it("block wins over any friendship row (either direction)", () => {
    expect(
      resolveFriendshipState(ME, OTHER, row("accepted", ME, OTHER), true)
    ).toBe("blocked")
    expect(
      resolveFriendshipState(ME, OTHER, row("pending", OTHER, ME), true)
    ).toBe("blocked")
    expect(resolveFriendshipState(ME, OTHER, null, true)).toBe("blocked")
  })

  it("accepted rows are friends regardless of direction", () => {
    expect(
      resolveFriendshipState(ME, OTHER, row("accepted", ME, OTHER), false)
    ).toBe("friends")
    expect(
      resolveFriendshipState(ME, OTHER, row("accepted", OTHER, ME), false)
    ).toBe("friends")
  })

  it("pending rows resolve relative to the viewer", () => {
    expect(resolveFriendshipState(ME, OTHER, row("pending", ME, OTHER), false)).toBe(
      "outgoing"
    )
    expect(resolveFriendshipState(ME, OTHER, row("pending", OTHER, ME), false)).toBe(
      "incoming"
    )
  })

  it("declined is not a friendship", () => {
    expect(resolveFriendshipState(ME, OTHER, row("declined", ME, OTHER), false)).toBe(
      "outgoing"
    )
    expect(resolveFriendshipState(ME, OTHER, row("declined", OTHER, ME), false)).toBe(
      "incoming"
    )
  })
})

describe("requestSendBlocker", () => {
  it("allows only none", () => {
    expect(requestSendBlocker("none")).toEqual({ ok: true })
    expect(requestSendBlocker("self")?.ok).toBe(false)
    expect(requestSendBlocker("friends")?.ok).toBe(false)
    expect(requestSendBlocker("outgoing")?.ok).toBe(false)
    expect(requestSendBlocker("incoming")?.ok).toBe(false)
    expect(requestSendBlocker("blocked")).toEqual({
      ok: false,
      error: "friends.errors.blocked",
    })
  })
})

describe("filterBlockedInvitees", () => {
  it("drops targets blocked in a set (either direction, resolved by caller)", () => {
    const targets = [{ userId: "a" }, { userId: "b" }, { userId: "c" }]
    expect(filterBlockedInvitees(targets, new Set(["b"]))).toEqual([
      { userId: "a" },
      { userId: "c" },
    ])
  })

  it("keeps everything when nobody is blocked", () => {
    const targets = [{ userId: "a" }, { userId: "b" }]
    expect(filterBlockedInvitees(targets, new Set())).toHaveLength(2)
  })
})
