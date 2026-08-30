import { describe, expect, it } from "vitest"
import { readFileSync, statSync } from "node:fs"
import path from "node:path"

import { bn } from "@/i18n/dictionaries/bn"
import { en } from "@/i18n/dictionaries/en"
import {
  AVATARS_BY_SERIES,
  AVATAR_CATALOG_VERSION,
  AVATAR_SERIES,
  PRESET_AVATARS,
  PRESET_AVATAR_IDS,
  getPresetAvatar,
  isPresetAvatarId,
  presetAvatarSrc,
} from "../avatar-catalog"

type Node = Record<string, unknown>

function flatten(node: Node, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(node)) {
    const pathKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === "object" && value !== null) {
      for (const [k, v] of flatten(value as Node, pathKey)) out.set(k, v)
    } else if (typeof value === "string") {
      out.set(pathKey, value)
    }
  }
  return out
}

const enFlat = flatten(en as Node)
const bnFlat = flatten(bn as Node)

const ASSETS_DIR = path.join(process.cwd(), "public", "avatars")
const MAX_BYTES = 8192
// External references/scripts/animation/live text are banned; the xmlns
// declaration itself is the only URL a self-contained svg may carry.
const FORBIDDEN = ["<script", "<image", "<animate", "<text", "<use", "href"]

describe("preset avatar catalog", () => {
  it("has unique kebab-case ids", () => {
    const ids = PRESET_AVATARS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it("exports the whitelist in catalog order", () => {
    expect(PRESET_AVATAR_IDS).toEqual(PRESET_AVATARS.map((a) => a.id))
  })

  it("partitions every avatar into exactly one series", () => {
    const grouped = AVATAR_SERIES.flatMap((s) => AVATARS_BY_SERIES[s])
    expect(grouped).toHaveLength(PRESET_AVATARS.length)
    for (const s of AVATAR_SERIES) {
      for (const avatar of AVATARS_BY_SERIES[s]) {
        expect(avatar.series).toBe(s)
      }
    }
  })

  it.each(PRESET_AVATARS.map((a) => [a.id, a] as const))(
    "%s: asset exists, is a clean 96x96 svg, and is labeled in both locales",
    (id, avatar) => {
      const file = path.join(ASSETS_DIR, `${id}.svg`)
      expect(statSync(file).isFile()).toBe(true)
      expect(statSync(file).size).toBeLessThanOrEqual(MAX_BYTES)

      const content = readFileSync(file, "utf8")
      expect(content.startsWith("<svg")).toBe(true)
      expect(content).toContain('viewBox="0 0 96 96"')
      for (const needle of FORBIDDEN) {
        expect(content, `${id} must not contain ${needle}`).not.toContain(needle)
      }

      expect(enFlat.has(avatar.labelKey), `${avatar.labelKey} missing in en`).toBe(true)
      expect(bnFlat.has(avatar.labelKey), `${avatar.labelKey} missing in bn`).toBe(true)
    }
  )

  it("resolves ids exactly (path-trust boundary)", () => {
    expect(isPresetAvatarId("ball-gold")).toBe(true)
    expect(isPresetAvatarId("../../evil")).toBe(false)
    expect(isPresetAvatarId("ball-gold.svg")).toBe(false)
    expect(isPresetAvatarId("ball-gold?x=1")).toBe(false)
    expect(isPresetAvatarId("")).toBe(false)
    expect(getPresetAvatar("ball-gold")?.series).toBe("football")
    expect(getPresetAvatar("nope")).toBeNull()
  })

  it("builds versioned asset sources", () => {
    expect(presetAvatarSrc("ball-gold")).toBe(
      `/avatars/ball-gold.svg?v=${AVATAR_CATALOG_VERSION}`
    )
    expect(presetAvatarSrc("nope")).toBeNull()
  })
})
