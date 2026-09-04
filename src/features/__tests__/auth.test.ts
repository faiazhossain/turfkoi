import { describe, it, expect } from "vitest"
import bcrypt from "bcryptjs"

import { resolveIdentifier } from "@/features/auth/identifier"
import { isTokenStale } from "@/features/auth/token-staleness"
import {
  registrationFormSchema,
  loginFormSchema,
  forgotPasswordFormSchema,
} from "@/features/auth/schemas"

/**
 * Auth model rewrite (email OTP + password login): these pin the identifier
 * resolution rules and the form gates the server actions rely on. No DB
 * needed - schema + pure helpers only.
 */

describe("resolveIdentifier", () => {
  it("recognizes emails and lowercases them", () => {
    expect(resolveIdentifier("Faiaz@Example.COM")).toEqual({
      kind: "email",
      email: "faiaz@example.com",
    })
  })

  it("recognizes BD phone numbers in local and international form", () => {
    expect(resolveIdentifier("01712345678")).toEqual({
      kind: "phone",
      phone: "+8801712345678",
    })
    expect(resolveIdentifier("+8801812345678")).toEqual({
      kind: "phone",
      phone: "+8801812345678",
    })
  })

  it("rejects malformed input", () => {
    expect(resolveIdentifier("")).toBeNull()
    expect(resolveIdentifier("not-an-email@")).toBeNull()
    expect(resolveIdentifier("0123456")).toBeNull() // not a BD mobile
  })
})

describe("registrationFormSchema", () => {
  const valid = {
    name: "Faiaz",
    phone: "01712345678",
    email: "faiaz@example.com",
    password: "longenough1",
  }

  it("accepts a valid registration and normalizes the email", () => {
    const parsed = registrationFormSchema.safeParse({
      ...valid,
      email: "  FAIAZ@Example.COM ",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.email).toBe("faiaz@example.com")
  })

  it("rejects a short password", () => {
    expect(
      registrationFormSchema.safeParse({ ...valid, password: "short" }).success
    ).toBe(false)
  })

  it("rejects a non-BD phone", () => {
    expect(
      registrationFormSchema.safeParse({ ...valid, phone: "12345" }).success
    ).toBe(false)
  })

  it("rejects a malformed email", () => {
    expect(
      registrationFormSchema.safeParse({ ...valid, email: "nope@" }).success
    ).toBe(false)
  })
})

describe("loginFormSchema", () => {
  it("accepts identifier + password", () => {
    expect(
      loginFormSchema.safeParse({ identifier: "01712345678", password: "x" })
        .success
    ).toBe(true)
  })

  it("rejects an empty identifier", () => {
    expect(
      loginFormSchema.safeParse({ identifier: "", password: "x" }).success
    ).toBe(false)
  })
})

describe("forgotPasswordFormSchema", () => {
  it("rejects phone numbers - resets are email-only", () => {
    expect(
      forgotPasswordFormSchema.safeParse({ email: "01712345678" }).success
    ).toBe(false)
  })
})

describe("bcrypt roundtrip (login path)", () => {
  it("hashes at registration and verifies at login", async () => {
    const hash = await bcrypt.hash("longenough1", 10)
    expect(hash).not.toBe("longenough1")
    expect(await bcrypt.compare("longenough1", hash)).toBe(true)
    expect(await bcrypt.compare("wrongpassword", hash)).toBe(false)
  })
})

describe("isTokenStale (password-reset session eviction)", () => {
  const iat = 1_700_000_000 // token issued at this epoch second
  const before = new Date(iat * 1000 - 60_000) // password changed 1 min before issue
  const after = new Date(iat * 1000 + 60_000) // password changed 1 min after issue

  it("accepts any token when the password was never changed", () => {
    expect(isTokenStale(iat, null)).toBe(false)
  })

  it("accepts a token issued after the password change", () => {
    expect(isTokenStale(iat, before)).toBe(false)
  })

  it("rejects a token issued before the password change", () => {
    expect(isTokenStale(iat, after)).toBe(true)
  })

  it("rejects a token with no iat once a password change exists", () => {
    expect(isTokenStale(undefined, after)).toBe(true)
  })
})
