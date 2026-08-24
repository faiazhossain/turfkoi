import { describe, expect, it } from "vitest"

import { OWNER_HELP_NOTE, OWNER_ONBOARDING_STEPS } from "./owner-help-button"

/**
 * Copy-only tests: vitest runs in a node environment, so the dialog itself is
 * not rendered. The invariants below keep the instructions aligned with the
 * real claim flow (admin-seeded turf, emailed/WhatsApped claim link, claim
 * button on /claim/[token]).
 */
describe("OWNER_ONBOARDING_STEPS", () => {
  it("walks the claim flow in order: listing, link, account, claim", () => {
    expect(OWNER_ONBOARDING_STEPS.map((step) => step.title)).toEqual([
      "We list your turf",
      "You receive a claim link",
      "Open the link, then register or sign in",
      "Press Claim turf",
    ])
  })

  it("every step has a title and a body", () => {
    for (const step of OWNER_ONBOARDING_STEPS) {
      expect(step.title.trim()).not.toBe("")
      expect(step.body.trim()).not.toBe("")
    }
  })

  it("states that owner accounts are invitation-based", () => {
    expect(OWNER_ONBOARDING_STEPS[0].body).toMatch(/invitation/i)
  })

  it("mentions the link expiry, matching CLAIM_INVITE_TTL_DAYS", () => {
    // Keep in sync with CLAIM_INVITE_TTL_DAYS in src/features/turf-claims/invites.ts.
    expect(OWNER_ONBOARDING_STEPS[1].body).toContain("14 days")
  })

  it("covers fresh registrations and existing accounts", () => {
    const copy = OWNER_ONBOARDING_STEPS[2].title + " " + OWNER_ONBOARDING_STEPS[2].body
    expect(copy.toLowerCase()).toContain("register")
    expect(copy.toLowerCase()).toContain("sign in")
  })

  it("ends on the claim action, like the /claim/[token] page does", () => {
    expect(OWNER_ONBOARDING_STEPS[3].title).toContain("Claim turf")
  })
})

describe("OWNER_HELP_NOTE", () => {
  it("reassures owners who have not been contacted yet", () => {
    expect(OWNER_HELP_NOTE).toMatch(/reach out/i)
  })
})
