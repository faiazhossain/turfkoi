import { afterAll, describe, expect, it, vi } from "vitest"

import { AVATAR_CATALOG_VERSION } from "../avatar-catalog"
import { initialsFromName, resolveAvatarDisplay } from "../avatar"

// clientImageUrl needs a cloud name to build delivery URLs.
vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "test-cloud")
afterAll(() => vi.unstubAllEnvs())

describe("resolveAvatarDisplay", () => {
  it("legacy rows (avatar_type NULL) behave as photo-when-set", () => {
    const display = resolveAvatarDisplay({
      avatarType: null,
      avatarPublicId: "deshiturf/players/u1/abc",
      name: "Rakib",
    })
    expect(display.kind).toBe("photo")
    expect((display as { src: string }).src).toContain("deshiturf/players/u1/abc")
    expect((display as { src: string }).src).toContain("c_fill,g_face")
  })

  it("legacy rows without a photo fall back to initials", () => {
    const display = resolveAvatarDisplay({
      avatarType: null,
      avatarPublicId: null,
      name: "Rakib Hasan",
    })
    expect(display).toEqual({ kind: "initials", text: "R H" })
  })

  it("preset mode with a known id serves the versioned catalog asset", () => {
    const display = resolveAvatarDisplay({
      avatarType: "preset",
      avatarPublicId: "deshiturf/players/u1/abc",
      avatarPresetId: "ball-gold",
      name: "Rakib",
    })
    expect(display).toEqual({
      kind: "preset",
      src: `/avatars/ball-gold.svg?v=${AVATAR_CATALOG_VERSION}`,
      labelKey: "player.avatars.ballGold",
    })
  })

  it("preset mode with an unknown id degrades to initials, never a broken img", () => {
    const display = resolveAvatarDisplay({
      avatarType: "preset",
      avatarPresetId: "../../evil",
      name: "Rakib",
    })
    expect(display).toEqual({ kind: "initials", text: "R" })
  })

  it("photo mode without an asset falls back to initials", () => {
    const display = resolveAvatarDisplay({
      avatarType: "photo",
      avatarPublicId: null,
      name: "Rakib",
    })
    expect(display).toEqual({ kind: "initials", text: "R" })
  })

  it("missing name yields an empty-initials display (icon fallback)", () => {
    expect(resolveAvatarDisplay({})).toEqual({ kind: "initials", text: "" })
  })
})

describe("initialsFromName", () => {
  it("takes the first two words (space-joined: a bare Bangla pair would conjunct)", () => {
    expect(initialsFromName("Faiaz Hossain")).toBe("F H")
  })

  it("is grapheme-safe for Bangla conjuncts and vowel signs", () => {
    expect(initialsFromName("রাকিব হাসান")).toBe("রা হা")
  })

  it("uses the single word when only one is given", () => {
    expect(initialsFromName("Rakib")).toBe("R")
  })

  it("handles null/empty names", () => {
    expect(initialsFromName(null)).toBe("")
    expect(initialsFromName("   ")).toBe("")
  })
})
