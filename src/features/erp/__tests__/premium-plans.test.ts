import { describe, expect, it } from "vitest"

import { nextPremiumUntil, planForMonths } from "../premium-plans"

describe("planForMonths", () => {
  it("returns configured plans and rejects others", () => {
    expect(planForMonths(1)?.amountBdt).toBe(500)
    expect(planForMonths(3)?.amountBdt).toBe(1200)
    expect(planForMonths(12)?.amountBdt).toBe(4000)
    expect(planForMonths(2)).toBeNull()
  })
})

describe("nextPremiumUntil (grant/extension math)", () => {
  const now = new Date("2026-08-28T00:00:00Z")

  it("starts from now for a new subscriber", () => {
    const until = nextPremiumUntil(null, 1, now)
    expect(until.getTime()).toBe(now.getTime() + 30 * 86_400_000)
  })

  it("starts from now when the old subscription already expired", () => {
    const expired = new Date("2026-08-01T00:00:00Z")
    const until = nextPremiumUntil(expired, 3, now)
    expect(until.getTime()).toBe(now.getTime() + 90 * 86_400_000)
  })

  it("extends on top of an active subscription", () => {
    const active = new Date("2026-09-27T00:00:00Z") // 30 days left
    const until = nextPremiumUntil(active, 1, now)
    expect(until.getTime()).toBe(active.getTime() + 30 * 86_400_000)
  })

  it("stacks months after an ongoing trial when notBefore is given", () => {
    const trialEnds = new Date("2026-10-15T00:00:00Z")
    const until = nextPremiumUntil(null, 1, now, trialEnds)
    expect(until.getTime()).toBe(trialEnds.getTime() + 30 * 86_400_000)
  })

  it("ignores notBefore when it is already in the past", () => {
    const past = new Date("2026-08-01T00:00:00Z")
    const until = nextPremiumUntil(null, 1, now, past)
    expect(until.getTime()).toBe(now.getTime() + 30 * 86_400_000)
  })
})
