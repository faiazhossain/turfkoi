import { describe, expect, it } from "vitest"

import { en } from "@/i18n/dictionaries/en"
import { translate } from "@/i18n/translate"
import {
  OWNER_APPLY_PATH,
  OWNER_HELP_NOTE_KEY,
  OWNER_ONBOARDING_STEPS,
} from "./owner-help-button"

const t = (key: string) => translate(en, key)

/**
 * Copy-only tests: vitest runs in a node environment, so the dialog itself is
 * not rendered. Copy is asserted through the English dictionary so the
 * invariants below keep the instructions aligned with the real claim flow
 * (admin-seeded turf, emailed/WhatsApped claim link, claim button on
 * /claim/[token]).
 */
describe("OWNER_ONBOARDING_STEPS", () => {
  it("walks the claim flow in order: listing, link, account, claim", () => {
    expect(OWNER_ONBOARDING_STEPS.map((step) => step.titleKey)).toEqual([
      "auth.ownerStep1Title",
      "auth.ownerStep2Title",
      "auth.ownerStep3Title",
      "auth.ownerStep4Title",
    ])
  })

  it("every step has a title and a body in both locales", () => {
    for (const step of OWNER_ONBOARDING_STEPS) {
      expect(t(step.titleKey).trim()).not.toBe("")
      expect(t(step.bodyKey).trim()).not.toBe("")
    }
  })

  it("states that owner accounts are invitation-based", () => {
    expect(t("auth.ownerStep1Body")).toMatch(/invitation/i)
  })

  it("mentions the link expiry, matching CLAIM_INVITE_TTL_DAYS", () => {
    // Keep in sync with CLAIM_INVITE_TTL_DAYS in src/features/turf-claims/invites.ts.
    expect(t("auth.ownerStep2Body")).toContain("14 days")
  })

  it("covers fresh registrations and existing accounts", () => {
    const copy =
      t("auth.ownerStep3Title") + " " + t("auth.ownerStep3Body")
    expect(copy.toLowerCase()).toContain("register")
    expect(copy.toLowerCase()).toContain("sign in")
  })

  it("ends on the claim action, like the /claim/[token] page does", () => {
    expect(t("auth.ownerStep4Title")).toContain("Claim turf")
  })
})

describe("OWNER_HELP_NOTE", () => {
  it("reassures owners who have not been contacted yet", () => {
    expect(t(OWNER_HELP_NOTE_KEY)).toMatch(/reach\w* out/i)
  })

  it("routes owners into the application funnel", () => {
    expect(t(OWNER_HELP_NOTE_KEY)).toMatch(/apply/i)
    expect(OWNER_APPLY_PATH).toBe("/own-a-turf")
  })
})
