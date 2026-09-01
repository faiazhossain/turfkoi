import { describe, expect, it } from "vitest"

import {
  isMatchLinkPath,
  maskPhone,
  matchSharePath,
  mintShareToken,
} from "../constants"

/**
 * Share-link invariants: the /m/<token> handle is a public convenience token
 * (8 hex chars, uniqueness enforced by the DB index), and the post-auth
 * redirect path must never accept anything but a server-shaped match path —
 * an open-redirect or protocol-relative value has to fail validation.
 */
describe("share tokens", () => {
  it("mint 8 lowercase hex characters", () => {
    for (let i = 0; i < 50; i++) {
      expect(mintShareToken()).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  it("mint distinct tokens across many draws", () => {
    const tokens = new Set(Array.from({ length: 200 }, mintShareToken))
    // 16^8 space — collisions in 200 draws are astronomically unlikely.
    expect(tokens.size).toBe(200)
  })

  it("build the canonical share path", () => {
    expect(matchSharePath("9f3x2l")).toBe("/m/9f3x2l")
  })
})

describe("match link path validation (post-auth redirect)", () => {
  it("accepts server-shaped match paths", () => {
    expect(
      isMatchLinkPath("/matches/1b4d1a29-0c1e-4f6f-9f2a-3f56f7f6f001")
    ).toBe(true)
    expect(isMatchLinkPath("/m/9f3x2l")).toBe(true)
  })

  it("rejects everything that is not a match path", () => {
    expect(isMatchLinkPath(null)).toBe(false)
    expect(isMatchLinkPath(undefined)).toBe(false)
    expect(isMatchLinkPath("")).toBe(false)
    expect(isMatchLinkPath("/app")).toBe(false)
    expect(isMatchLinkPath("/admin")).toBe(false)
    expect(isMatchLinkPath("/matches")).toBe(false) // prefix, not a match page
  })

  it("rejects protocol-relative, backslash, and oversized values", () => {
    expect(isMatchLinkPath("//evil.example.com/m/abc")).toBe(false)
    expect(isMatchLinkPath("/matches/..\\..\\")).toBe(false)
    expect(isMatchLinkPath(`/${"a".repeat(201)}`)).toBe(false)
    expect(isMatchLinkPath("https://evil.example.com/m/abc")).toBe(false)
  })
})

describe("phone masking", () => {
  it("keeps the prefix and last two digits only", () => {
    expect(maskPhone("01712345678")).toBe("0171**78")
  })

  it("never expands a short value", () => {
    expect(maskPhone("123")).toBe("123")
    expect(maskPhone("1234")).toBe("1234")
  })
})
