import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/**
 * WCAG 2.1 contrast floors for the design tokens in globals.css. Tokens are
 * parsed from the stylesheet (not duplicated here) so a palette change that
 * quietly drops below a floor fails CI instead of shipping. Surfaces without
 * a token (alpha tints over card/background) are composited the way browsers
 * blend them, matching what renders on screen.
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

function designTokens() {
  const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8")
  const rootBlock = css.match(/:root,\s*\.dark\s*\{([\s\S]*?)\}/)?.[1] ?? ""
  const tokens: Record<string, string> = {}
  for (const [, name, value] of rootBlock.matchAll(
    /--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g
  )) {
    tokens[name] = value
  }
  return tokens
}

const t = designTokens()

/** Body-text floors: anything a user reads needs 4.5:1. */
describe("token text contrast (WCAG AA, 4.5:1)", () => {
  it("keeps muted-foreground readable on every surface it appears on", () => {
    for (const surface of ["background", "card", "muted", "accent"]) {
      expect(contrast(t["muted-foreground"], t[surface])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps muted text readable inside the red danger-zone card", () => {
    const dangerCard = tint(t["destructive"], 0.1, t["background"])
    expect(contrast(t["muted-foreground"], dangerCard)).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps each status color readable on its own badge tint over a card", () => {
    for (const color of [
      "success",
      "info",
      "warning",
      "destructive",
      "primary",
    ]) {
      const badgeBg = tint(t[color], 0.15, t["card"])
      expect(contrast(t[color], badgeBg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps destructive copy readable on the danger-zone card and badge tints", () => {
    const dangerCard = tint(t["destructive"], 0.1, t["background"])
    expect(contrast(t["destructive"], dangerCard)).toBeGreaterThanOrEqual(4.5)
    // Badge dark variant rests on a /15 tint (bg-destructive/15 over card).
    const badgeBg = tint(t["destructive"], 0.15, t["card"])
    expect(contrast(t["destructive"], badgeBg)).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps button and badge foregrounds readable on their solid fills", () => {
    const pairs = [
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["destructive-foreground", "destructive"],
      ["success-foreground", "success"],
      ["info-foreground", "info"],
      ["warning-foreground", "warning"],
    ] as const
    for (const [fg, bg] of pairs) {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/**
 * Control-boundary floors (WCAG 1.4.11, 3:1). Transparent inputs carry no
 * fill, so their border is the only thing marking them as fields — the
 * original "I didn't realize I had to type there" bug this suite guards.
 */
describe("token control contrast (WCAG 1.4.11, 3:1)", () => {
  it("keeps input borders visible on every surface inputs rest on", () => {
    const dangerCard = tint(t["destructive"], 0.1, t["background"])
    for (const surface of [t["background"], t["card"], t["muted"], dangerCard]) {
      expect(contrast(t["input"], surface)).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps the focus ring visible against the page background", () => {
    expect(contrast(t["ring"], t["background"])).toBeGreaterThanOrEqual(3)
  })
})

/**
 * Section delineation floor. Cards sit a hair above the page background, so
 * the border carries the separation; 1.5:1 is the project's soft target for
 * a visible-but-quiet outline (below the 1.27:1 the palette shipped with,
 * sections blurred into each other).
 */
describe("token delineation floor (1.5:1)", () => {
  it("keeps card borders distinguishable from their surroundings", () => {
    expect(contrast(t["border"], t["card"])).toBeGreaterThanOrEqual(1.5)
    expect(contrast(t["border"], t["background"])).toBeGreaterThanOrEqual(1.5)
    expect(contrast(t["sidebar-border"], t["sidebar"])).toBeGreaterThanOrEqual(1.5)
  })
})
