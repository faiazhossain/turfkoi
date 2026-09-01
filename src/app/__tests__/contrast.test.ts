import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/**
 * WCAG 2.1 contrast floors, parsed from globals.css (not duplicated here) so
 * a palette change that quietly drops below a floor fails CI instead of
 * shipping. Two layers are guarded:
 *
 *  - the raw dt-* page palette (docs/TAILWIND_MIGRATION.md) — every surface,
 *    text, accent, control, and delineation color the app renders with;
 *  - the slim semantic status layer (success/info/warning/destructive) that
 *    survived the token removal, composited over dt surfaces the way
 *    StatusBadge and danger-zone tints actually render.
 */

function luminance(r: number, g: number, b: number) {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function toRgb(value: string) {
  const hex = value.replace("#", "")
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ] as const
}

function contrast(fg: string, bg: string) {
  const l1 = luminance(...toRgb(fg))
  const l2 = luminance(...toRgb(bg))
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** Blend a color at alpha over a base, like the browser composites `bg-x/n`. */
function tint(color: string, alpha: number, base: string) {
  const [fr, fg, fb] = toRgb(color)
  const [br, bg, bb] = toRgb(base)
  const mix = (f: number, b: number) =>
    Math.round(f * alpha + b * (1 - alpha))
  const part = (n: number) => n.toString(16).padStart(2, "0")
  return `#${part(mix(fr, br))}${part(mix(fg, bg))}${part(mix(fb, bb))}`
}

function cssVars() {
  const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8")
  const rootBlock = css.match(/:root,\s*\.dark\s*\{([\s\S]*?)\}/)?.[1] ?? ""
  const vars: Record<string, string> = {}
  for (const [, name, value] of rootBlock.matchAll(
    /--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g
  )) {
    vars[name] = value
  }
  return vars
}

const status = cssVars()

/** Raw page palette (docs/TAILWIND_MIGRATION.md), from the @theme block. */
function dtPalette() {
  const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8")
  const palette: Record<string, string> = {}
  for (const [, name, value] of css.matchAll(
    /--color-dt-([a-z0-9]+):\s*(#[0-9A-Fa-f]{6})/g
  )) {
    palette[name] = value
  }
  return palette
}

const dt = dtPalette()

const DT_KEYS = [
  "bg",
  "bg2",
  "card",
  "card2",
  "line",
  "input",
  "txt",
  "dim",
  "green",
  "teal",
  "blue",
  "red",
  "ink",
  "off",
] as const

describe("dt palette completeness", () => {
  it("declares every palette constant the migration contract names", () => {
    expect(Object.keys(dt).sort()).toEqual([...DT_KEYS].sort())
  })
})

/** dt surfaces a text-bearing component can rest on. */
const DT_SURFACES = ["bg", "bg2", "card", "card2"] as const

describe("dt palette text contrast (WCAG AA, 4.5:1)", () => {
  it("keeps dt-txt and dt-dim readable on every dt surface", () => {
    for (const surface of DT_SURFACES) {
      expect(contrast(dt["txt"], dt[surface])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dt["dim"], dt[surface])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps CTA labels readable on both ends of the green-to-teal gradient", () => {
    expect(contrast(dt["ink"], dt["green"])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(dt["ink"], dt["teal"])).toBeGreaterThanOrEqual(4.5)
  })
})

describe("dt palette accent text (WCAG 1.4.11, 3:1)", () => {
  it("keeps accent-colored text distinguishable on card surfaces", () => {
    for (const color of ["green", "blue", "red"] as const) {
      expect(contrast(dt[color], dt["card"])).toBeGreaterThanOrEqual(3)
      expect(contrast(dt[color], dt["card2"])).toBeGreaterThanOrEqual(3)
    }
  })
})

describe("dt palette control contrast (WCAG 1.4.11, 3:1)", () => {
  it("keeps input borders visible on every surface inputs rest on", () => {
    for (const surface of DT_SURFACES) {
      expect(contrast(dt["input"], dt[surface])).toBeGreaterThanOrEqual(3)
    }
  })
})

describe("dt palette delineation floor (1.5:1)", () => {
  it("keeps dt-line borders distinguishable from their surroundings", () => {
    for (const surface of DT_SURFACES) {
      expect(contrast(dt["line"], dt[surface])).toBeGreaterThanOrEqual(1.5)
    }
  })
})

/**
 * The surviving semantic status layer (success/info/warning/destructive),
 * composited over dt surfaces the way StatusBadge tints and danger-zone
 * cards actually render.
 */
describe("status token contrast", () => {
  it("keeps each status color readable on its own badge tint over dt-card", () => {
    for (const color of ["success", "info", "warning", "destructive"] as const) {
      const badgeBg = tint(status[color], 0.15, dt["card"])
      expect(contrast(status[color], badgeBg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps destructive copy readable on the danger-zone card and badge tints", () => {
    const dangerCard = tint(status["destructive"], 0.1, dt["bg"])
    expect(contrast(status["destructive"], dangerCard)).toBeGreaterThanOrEqual(4.5)
    // Badge dark variant rests on a /15 tint over dt-card.
    const badgeBg = tint(status["destructive"], 0.15, dt["card"])
    expect(contrast(status["destructive"], badgeBg)).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps status foregrounds readable on their solid fills", () => {
    const pairs = [
      ["destructive-foreground", "destructive"],
      ["success-foreground", "success"],
      ["info-foreground", "info"],
      ["warning-foreground", "warning"],
    ] as const
    for (const [fg, bg] of pairs) {
      expect(contrast(status[fg], status[bg])).toBeGreaterThanOrEqual(4.5)
    }
  })
})
