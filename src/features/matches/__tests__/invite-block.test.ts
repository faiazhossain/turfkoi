import { describe, expect, it } from "vitest"

import { filterBlockedInvitees } from "@/features/friends/state"

/**
 * Block enforcement for match invitations (Player Network): the invite
 * action resolves the inviter's blocked set (either direction) and must
 * exclude those targets before any invitation row is created. Phones that
 * resolve to registered users are folded into the same id set upstream.
 */
describe("invite block filtering", () => {
  it("filters blocked users out of mixed invite targets", () => {
    const targets = [
      { userId: "friend-1" },
      { userId: "enemy" },
      { userId: "friend-2" },
    ]
    const blocked = new Set(["enemy"])
    expect(filterBlockedInvitees(targets, blocked)).toEqual([
      { userId: "friend-1" },
      { userId: "friend-2" },
    ])
  })

  it("can empty the target list entirely", () => {
    const targets = [{ userId: "enemy" }]
    expect(filterBlockedInvitees(targets, new Set(["enemy"]))).toEqual([])
  })
})
