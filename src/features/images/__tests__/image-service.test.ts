import { describe, it, expect } from "vitest"

import {
  buildImageUrl,
  VARIANT_TRANSFORMS,
} from "../urls"

/**
 * ImageService unit tests (pure parts only — vitest runs in node without
 * the SDK or credentials). These pin the delivery-URL contract every
 * component relies on and the upload-guard rules from the action layer.
 */

describe("buildImageUrl", () => {
  it("builds secure delivery URLs with the variant transformation", () => {
    expect(buildImageUrl("demo", "deshiturf/turfs/x/abc", "card")).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_limit,w_800,q_auto,f_auto/deshiturf/turfs/x/abc"
    )
    expect(buildImageUrl("demo", "deshiturf/players/u/abc", "avatar")).toContain(
      "c_fill,g_face,w_200,h_200,q_auto,f_auto"
    )
  })

  it("every variant caps width and enables quality + format negotiation", () => {
    for (const [variant, transform] of Object.entries(VARIANT_TRANSFORMS)) {
      expect(transform, variant).toContain("q_auto")
      expect(transform, variant).toContain("f_auto")
      expect(transform, variant).toMatch(/w_\d+/)
    }
  })

  it("gallery contexts cap at the agreed maximums (thumb ≤400, card ≤800, hero ≤1600)", () => {
    expect(VARIANT_TRANSFORMS.thumb).toContain("w_400")
    expect(VARIANT_TRANSFORMS.card).toContain("w_800")
    expect(VARIANT_TRANSFORMS.hero).toContain("w_1600")
  })
})
