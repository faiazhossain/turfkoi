import { describe, expect, it } from "vitest"

import { bn } from "../dictionaries/bn"
import { en } from "../dictionaries/en"
import {
  BOOKING_STATUS_LABEL,
  MATCH_STATE_LABEL,
  SLOT_STATUS_LABEL,
  TEAM_MEMBER_ROLE_LABEL,
  TURF_FORMAT_LABEL,
  USER_ROLE_LABEL,
} from "../labels"

type Node = Record<string, unknown>

function flatten(node: Node, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "object" && value !== null) {
      for (const [k, v] of flatten(value as Node, path)) out.set(k, v)
    } else if (typeof value === "string") {
      out.set(path, value)
    }
  }
  return out
}

const enFlat = flatten(en as Node)
const bnFlat = flatten(bn as Node)

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

describe("bn/en dictionary parity", () => {
  it("bn defines exactly the same keys as en (no missing, no extra)", () => {
    const missing = [...enFlat.keys()].filter((k) => !bnFlat.has(k))
    const extra = [...bnFlat.keys()].filter((k) => !enFlat.has(k))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it("no empty strings in either dictionary", () => {
    for (const [key, value] of enFlat) expect(value, `en.${key}`).not.toBe("")
    for (const [key, value] of bnFlat) expect(value, `bn.${key}`).not.toBe("")
  })

  it("interpolation placeholders match between locales for every key", () => {
    for (const [key, enValue] of enFlat) {
      const bnValue = bnFlat.get(key) ?? ""
      expect(placeholders(enValue), key).toEqual(placeholders(bnValue))
    }
  })
})

describe("label maps resolve in both dictionaries", () => {
  const maps = [
    ["bookingStatusLabel", BOOKING_STATUS_LABEL],
    ["matchStateLabel", MATCH_STATE_LABEL],
    ["slotStatusLabel", SLOT_STATUS_LABEL],
    ["teamMemberRoleLabel", TEAM_MEMBER_ROLE_LABEL],
    ["userRoleLabel", USER_ROLE_LABEL],
    ["turfFormatLabelKey", TURF_FORMAT_LABEL],
  ] as const

  it.each(maps)("%s keys exist in en and bn", (_name, map) => {
    for (const key of Object.values(map)) {
      expect(enFlat.has(key), `${key} missing in en`).toBe(true)
      expect(bnFlat.has(key), `${key} missing in bn`).toBe(true)
    }
  })
})
