import { describe, expect, it } from "vitest"

import {
  PLAYER_ID_ALPHABET,
  PLAYER_ID_LENGTH,
  generatePlayerId,
  isPlayerIdFormat,
  normalizeUsername,
  suggestUsername,
  validateUsername,
} from "../username"

/**
 * Player identity invariants (Player Network): the DeshiTurf ID is a
 * permanent, unguessable-ish public handle (DT-XXXXXX, unambiguous
 * alphabet), and usernames are a strict lowercase namespace with reserved
 * words carved out. Both are pure — DB uniqueness is enforced by indexes.
 */
describe("player id", () => {
  it("generates DT- + 6 unambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      const id = generatePlayerId()
      expect(id).toMatch(new RegExp(`^DT-[${PLAYER_ID_ALPHABET}]{${PLAYER_ID_LENGTH}}$`))
    }
  })

  it("never uses ambiguous characters (0/O/1/I/L)", () => {
    for (let i = 0; i < 200; i++) {
      const id = generatePlayerId()
      expect(id.slice(3)).not.toMatch(/[0O1IL]/)
    }
  })

  it("is deterministic under an injected rand", () => {
    let n = 0
    const rand = () => {
      n++
      return ((n * 7) % 31) / 31
    }
    let m = 0
    const rand2 = () => {
      m++
      return ((m * 7) % 31) / 31
    }
    expect(generatePlayerId(rand)).toBe(generatePlayerId(rand2))
  })

  it("validates format strictly", () => {
    expect(isPlayerIdFormat("DT-8K4P29")).toBe(true)
    expect(isPlayerIdFormat("DT-8K4P2")).toBe(false)
    expect(isPlayerIdFormat("DT-8K4P2O")).toBe(false) // O ambiguous
    expect(isPlayerIdFormat("dt-8k4p29")).toBe(false) // uppercase canonical
    expect(isPlayerIdFormat("XX-8K4P29")).toBe(false)
    expect(isPlayerIdFormat("")).toBe(false)
  })
})

describe("username validation", () => {
  it("accepts 3-20 chars of a-z 0-9 underscore", () => {
    expect(validateUsername("rahim_10")).toEqual({ ok: true, value: "rahim_10" })
    expect(validateUsername("abc")).toEqual({ ok: true, value: "abc" })
  })

  it("normalizes @prefix and case", () => {
    expect(normalizeUsername("  @Rahim10 ")).toBe("rahim10")
    expect(validateUsername("@Rahim10")).toEqual({ ok: true, value: "rahim10" })
  })

  it("rejects bad length and characters with the dict error key", () => {
    expect(validateUsername("ab")?.ok).toBe(false)
    expect(validateUsername("has space")).toEqual({
      ok: false,
      error: "auth.errors.usernameInvalid",
    })
    expect(validateUsername("বাংলা")).toEqual({
      ok: false,
      error: "auth.errors.usernameInvalid",
    })
    expect(validateUsername("x".repeat(21)).ok).toBe(false)
  })

  it("rejects reserved handles", () => {
    expect(validateUsername("admin")).toEqual({
      ok: false,
      error: "auth.errors.usernameReserved",
    })
    expect(validateUsername("DeshiTurf")).toEqual({
      ok: false,
      error: "auth.errors.usernameReserved",
    })
  })
})

describe("username suggestions", () => {
  it("slugifies the latin part of a name and appends a suffix", () => {
    const name = suggestUsername("Rahim Uddin", () => 0)
    expect(name).toMatch(/^rahimuddin\d{4}$/)
  })

  it("falls back to player for Bangla-only names", () => {
    const name = suggestUsername("রহিম উদ্দিন", () => 0)
    expect(name).toMatch(/^player\d{4}$/)
  })

  it("caps the suggestion at 20 characters", () => {
    expect(suggestUsername("A".repeat(40), () => 0).length).toBeLessThanOrEqual(20)
  })
})
