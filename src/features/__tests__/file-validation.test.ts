import { describe, it, expect } from "vitest"

import { detectImageMime, isAllowedImageMime } from "@/lib/file-validation"

/**
 * J5 — negative-path tests for the H5 magic-byte sniff. A spoofed extension
 * (file renamed to .jpg but bytes are PNG / HTML / random) must be detected
 * as the real type or rejected. This is the core defence against the audit's
 * "extension checks are trivially bypassed" finding.
 */
describe("detectImageMime — negative paths", () => {
  const PNG_BYTES = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ])
  const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
  const WEBP_BYTES = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ])
  const AVIF_BYTES = Uint8Array.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
  ])
  const HTML_SPOOF = Uint8Array.from([
    0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, // "<html>"
  ])
  const RANDOM = Uint8Array.from([0x00, 0x01, 0x02, 0x03])

  it("detects each supported type from its magic bytes", () => {
    expect(detectImageMime(JPEG_BYTES)).toBe("image/jpeg")
    expect(detectImageMime(PNG_BYTES)).toBe("image/png")
    expect(detectImageMime(WEBP_BYTES)).toBe("image/webp")
    expect(detectImageMime(AVIF_BYTES)).toBe("image/avif")
  })

  it("rejects HTML disguised as an image (extension spoof)", () => {
    expect(detectImageMime(HTML_SPOOF)).toBeNull()
    expect(isAllowedImageMime(detectImageMime(HTML_SPOOF))).toBe(false)
  })

  it("rejects random bytes", () => {
    expect(detectImageMime(RANDOM)).toBeNull()
  })

  it("detects PNG even if the client claimed image/jpeg", () => {
    // This is exactly the spoof the verify route catches: declared jpeg, real png.
    const real = detectImageMime(PNG_BYTES)
    expect(real).toBe("image/png")
    expect(real === "image/jpeg").toBe(false)
  })
})
