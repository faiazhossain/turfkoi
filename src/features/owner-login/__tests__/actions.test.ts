import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

/**
 * Owner login actions (turfkoi-2fw.4): admin gating + unowned-turf guard +
 * password lock for the mint action; phone validation, wrong-code, and
 * no-account paths for the login action. codes.ts and owner-account.ts run
 * real against the mocked db. Same no-DB approach as turf-controls.test.ts.
 */

type Rows = Record<string, unknown>[]
let selectQueue: Rows[] = []
let updateReturnQueue: Rows[] = []
let updateCalls: { table: unknown; set: unknown }[] = []
let insertValues: unknown[] = []
let logCalls: { evt: string; ctx: unknown }[] = []
let currentUser: { id: string; roles: string[] } | null = null
let userByPhone: { id: string; phone: string; status: string } | null = null
let signInCalls: { identifier: string; password: string }[] = []

function queryFor(rows: Rows) {
  const q: Record<string, unknown> = {}
  const end = () => Promise.resolve(rows)
  const promise = end()
  q.then = promise.then.bind(promise)
  q.from = vi.fn(() => q)
  q.leftJoin = vi.fn(() => q)
  q.innerJoin = vi.fn(() => q)
  q.where = vi.fn(() => q)
  q.orderBy = vi.fn(() => q)
  q.limit = vi.fn(end)
  return q
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => queryFor(selectQueue.shift() ?? [])),
    update: vi.fn((table: unknown) => {
      const q: Record<string, unknown> = {}
      q.set = vi.fn((set: unknown) => {
        updateCalls.push({ table, set })
        return q
      })
      q.where = vi.fn(() => q)
      q.returning = vi.fn(() =>
        Promise.resolve(updateReturnQueue.shift() ?? [{ id: "updated" }])
      )
      return q
    }),
    insert: vi.fn((table: unknown) => {
      const q: Record<string, unknown> = {}
      q.values = vi.fn((v: unknown) => {
        insertValues.push({ table, values: v })
        return q
      })
      return q
    }),
  },
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => null })),
}))

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(async () => true),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn((evt: string, ctx: unknown) => logCalls.push({ evt, ctx })),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/features/auth/users", () => ({
  getUserByPhone: vi.fn(async () => userByPhone),
}))

vi.mock("@/auth", () => ({
  signIn: vi.fn(async (_provider: string, creds: { identifier: string; password: string }) => {
    signInCalls.push({ identifier: creds.identifier, password: creds.password })
  }),
}))

// next-auth pulls in next/server, which doesn't resolve outside a Next
// runtime — only the AuthError class shape is needed here.
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}))

import { mintOwnerLoginCodeAction, ownerCodeLoginAction } from "../actions"

const ADMIN = { id: "admin-1", roles: ["admin"] }
const PLAYER = { id: "player-1", roles: ["player"] }
const TURF_ID = "00000000-0000-4000-8000-000000000001"
const OWNER_ID = "00000000-0000-4000-8000-000000000002"
const PHONE = "+8801712345678"

// An active, unexpired code row for verifyOwnerLoginCode's lookup; its
// hash matches the fixed dev code.
function codeRowForLogin() {
  return {
    id: "code-1",
    phone: PHONE,
    codeHash: sha256("123456"),
    attempts: 0,
    lockedUntil: null,
    consumedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  }
}

beforeEach(() => {
  selectQueue = []
  updateReturnQueue = []
  updateCalls = []
  insertValues = []
  logCalls = []
  currentUser = null
  userByPhone = null
  signInCalls = []
  vi.clearAllMocks()
})

describe("mintOwnerLoginCodeAction", () => {
  it("rejects callers without the admin role", async () => {
    currentUser = PLAYER
    const res = await mintOwnerLoginCodeAction({ turfId: TURF_ID, lockPassword: false })
    expect(res).toEqual({ ok: false, error: "errors.adminOnly" })
    expect(insertValues.length).toBe(0)
  })

  it("refuses unowned turfs and points at the claim invite instead", async () => {
    currentUser = ADMIN
    selectQueue = [
      [{ turfName: "Seed Turf", ownerId: null, ownerPhone: null }],
    ]
    const res = await mintOwnerLoginCodeAction({ turfId: TURF_ID, lockPassword: false })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("ownerCode.errors.noOwner")
    expect(insertValues.length).toBe(0)
  })

  it("mints for an owned turf and clears the stored password when lockPassword is set", async () => {
    currentUser = ADMIN
    selectQueue = [[{ turfName: "Green Field", ownerId: OWNER_ID, ownerPhone: PHONE }]]
    const res = await mintOwnerLoginCodeAction({
      turfId: TURF_ID,
      lockPassword: true,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.code).toBe("123456") // fixed dev code
      expect(res.phone).toBe(PHONE)
      expect(res.passwordLocked).toBe(true)
    }
    // Password cleared before the code insert.
    expect(updateCalls[0]?.set).toMatchObject({ passwordHash: null })
    expect(insertValues.length).toBe(1)
    expect(logCalls.map((l) => l.evt)).toContain("admin.owner_login_code_minted")
  })
})

describe("ownerCodeLoginAction", () => {
  it("rejects a non-Bangladeshi phone before touching the db", async () => {
    const res = await ownerCodeLoginAction({ phone: "12345", code: "123456" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("ownerCode.errors.invalidPhone")
    expect(selectQueue.length).toBe(0)
  })

  it("reports a wrong code with attempts left", async () => {
    selectQueue = [[
      {
        id: "code-1",
        phone: PHONE,
        codeHash: "not-the-hash",
        attempts: 1,
        lockedUntil: null,
        consumedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    ]]
    const res = await ownerCodeLoginAction({ phone: "01712345678", code: "123456" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("ownerCode.errors.wrongCode")
      
    }
    expect(signInCalls.length).toBe(0)
  })

  it("refuses a valid code with no account behind the phone", async () => {
    selectQueue = [[codeRowForLogin()]]
    userByPhone = null
    const res = await ownerCodeLoginAction({ phone: "01712345678", code: "123456" })
    expect(res).toEqual({ ok: false, error: "ownerCode.errors.noAccount" })
    expect(signInCalls.length).toBe(0)
  })

  it("signs the owner in with a rotated one-time password on a valid code", async () => {
    selectQueue = [[codeRowForLogin()]]
    userByPhone = { id: OWNER_ID, phone: PHONE, status: "active" }
    const res = await ownerCodeLoginAction({ phone: "01712345678", code: "123456" })
    expect(res).toEqual({ ok: true })
    expect(signInCalls.length).toBe(1)
    expect(signInCalls[0]?.identifier).toBe(PHONE)
    // The one-time password is the generated simple-password shape.
    expect(signInCalls[0]?.password).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/)
  })
})
