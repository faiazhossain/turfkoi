import { describe, it, expect } from "vitest"

import { validateImageFile, MAX_ORIGINAL_BYTES } from "../image-compress"

/** Pure upload guards (no canvas in node — compression itself needs a DOM). */
describe("validateImageFile", () => {
  it("accepts the supported image types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(validateImageFile({ type, size: 1000 }).ok, type).toBe(true)
    }
  })

  it("rejects non-image and spoofable types", () => {
    for (const type of ["text/html", "application/pdf", "image/gif", "image/svg+xml", ""]) {
      expect(validateImageFile({ type, size: 1000 }).ok, type || "(empty)").toBe(false)
    }
  })

  it("rejects files over the original-size cap", () => {
    const res = validateImageFile({ type: "image/jpeg", size: MAX_ORIGINAL_BYTES + 1 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/too big/i)
  })

  it("rejects empty files", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 0 }).ok).toBe(false)
  })

  it("respects a custom cap", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 500 }, 100).ok).toBe(false)
    expect(validateImageFile({ type: "image/jpeg", size: 100 }, 100).ok).toBe(true)
  })
})
