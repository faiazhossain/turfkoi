import { describe, expect, it } from "vitest"

import { resolveLocale } from "../config"
import { translate } from "../translate"
import { translateError } from "../client"

describe("resolveLocale", () => {
  it("defaults to Bangla when the cookie is absent", () => {
    expect(resolveLocale(undefined)).toBe("bn")
    expect(resolveLocale(null)).toBe("bn")
  })

  it("falls back to Bangla for unrecognized values", () => {
    expect(resolveLocale("garbage")).toBe("bn")
    expect(resolveLocale("EN")).toBe("bn")
    expect(resolveLocale("bn")).toBe("bn")
  })

  it("returns English only for the exact en value", () => {
    expect(resolveLocale("en")).toBe("en")
  })
})

describe("translate", () => {
  const dict = {
    greet: "Hello {name}",
    nested: { plain: "Plain", withParams: "{a} and {b}" },
    empty: "",
  }

  it("resolves nested dot-path keys", () => {
    expect(translate(dict, "nested.plain")).toBe("Plain")
  })

  it("interpolates named params", () => {
    expect(translate(dict, "greet", { name: "World" })).toBe("Hello World")
    expect(translate(dict, "nested.withParams", { a: 1, b: 2 })).toBe("1 and 2")
  })

  it("leaves unknown params intact", () => {
    expect(translate(dict, "greet", {})).toBe("Hello {name}")
  })

  it("returns the key itself when unknown (legacy passthrough)", () => {
    expect(translate(dict, "missing.key")).toBe("missing.key")
    expect(translate(dict, "That slot was just taken.")).toBe("That slot was just taken.")
  })

  it("falls back to the key when the value is an empty string", () => {
    expect(translate(dict, "empty")).toBe("empty")
  })
})

describe("translateError", () => {
  const dict = { errors: { generic: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।" } }
  const t = (key: string) => translate(dict, key)

  it("renders object errors through their key", () => {
    expect(translateError({ key: "errors.generic" }, t)).toContain("সমস্যা")
  })

  it("passes plain strings through t() and defaults when absent", () => {
    expect(translateError("errors.generic", t)).toContain("সমস্যা")
    expect(translateError(undefined, t)).toContain("সমস্যা")
    expect(translateError("Legacy sentence.", t)).toBe("Legacy sentence.")
  })
})
