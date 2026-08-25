import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"

/**
 * Owner login code unit tests (turfkoi-2fw.4). The db is mocked with
 * chainable builders — pinning the minting, attempt/lock, consume, and
 * revoke rules without a database, same approach as claim-otp.test.ts.
 */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

type Rows = Record<string, unknown>[]
let selectQueue: Rows[] = []
let updateCalls: { table: unknown; set: unknown }[] = []
let insertValues: unknown[] = []

function queryFor(rows: Rows) {
  const q: Record<string, unknown> = {}
  const end = () => Promise.resolve(rows)
  q.from = vi.fn(() => q)
  q.leftJoin = vi.fn(() => q)
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
      q.returning = vi.fn(() => Promise.resolve([{ id: "updated" }]))
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

import { mintOwnerLoginCode, verifyOwnerLoginCode } from "../codes"

const PHONE_IN = "01712345678"
const PHONE = "+8801712345678"

beforeEach(() => {
  selectQueue = []
  updateCalls = []
  insertValues = []
  vi.clearAllMocks()
})

function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-1",
    phone: PHONE,
    codeHash: sha256("123456"),
    attempts: 0,
    lockedUntil: null,
    consumedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    createdAt: new Date(),
    ...overrides,
  }
}

describe("mintOwnerLoginCode", () => {
  it("revokes previous active codes, then stores the hashed dev code with a 15-minute TTL", async () => {
    const before = Date.now()
    const { code, expiresAt } = await mintOwnerLoginCode("admin-1", PHONE_IN)
    expect(code).toBe("123456") // fixed in non-production
    expect(expiresAt.getTime()).toBeGreaterThan(before + 14 * 60_000)
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + 16 * 60_000)
    // First write revokes the previous active code for the phone.
    expect(updateCalls.length).toBe(1)
    expect((updateCalls[0]?.set as Record<string, unknown>).revokedAt).toBeInstanceOf(Date)
    // Then the insert carries the normalized phone and sha256 hash.
    const inserted = insertValues[0] as Record<string, unknown>
    expect(inserted.table).toBeDefined()
    expect((inserted.values as Record<string, unknown>).phone).toBe(PHONE)
    expect((inserted.values as Record<string, unknown>).codeHash).toBe(sha256("123456"))
  })
})

describe("verifyOwnerLoginCode", () => {
  it("succeeds on the right code, normalizes the phone, and consumes once", async () => {
    selectQueue = [[codeRow()]]
    const res = await verifyOwnerLoginCode(PHONE_IN, "123456")
    expect(res).toEqual({ ok: true, phone: PHONE })
    expect(updateCalls.length).toBe(1)
    expect((updateCalls[0]?.set as Record<string, unknown>).consumedAt).toBeInstanceOf(Date)
  })

  it("counts attempts and reports how many are left", async () => {
    selectQueue = [[codeRow({ attempts: 2 })]]
    const res = await verifyOwnerLoginCode(PHONE, "000000")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe("invalid")
      expect(res.attemptsLeft).toBe(2)
    }
  })

  it("locks at 5 wrong attempts", async () => {
    selectQueue = [[codeRow({ attempts: 4 })]]
    const res = await verifyOwnerLoginCode(PHONE, "000000")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("locked")
    const lockUpdate = updateCalls[0]?.set as Record<string, unknown>
    expect(lockUpdate.lockedUntil).toBeInstanceOf(Date)
  })

  it("rejects a consumed code", async () => {
    selectQueue = [[codeRow({ consumedAt: new Date() })]]
    const res = await verifyOwnerLoginCode(PHONE, "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("consumed")
  })

  it("rejects a revoked (superseded) code", async () => {
    selectQueue = [[codeRow({ revokedAt: new Date() })]]
    const res = await verifyOwnerLoginCode(PHONE, "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("revoked")
  })

  it("surfaces expired codes", async () => {
    selectQueue = [[codeRow({ expiresAt: new Date(Date.now() - 1_000) })]]
    const res = await verifyOwnerLoginCode(PHONE, "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("expired")
  })

  it("rejects an active lock before checking the code", async () => {
    selectQueue = [[codeRow({ lockedUntil: new Date(Date.now() + 60_000) })]]
    const res = await verifyOwnerLoginCode(PHONE, "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("locked")
  })

  it("reports no_code when the phone has no codes", async () => {
    selectQueue = [[]]
    const res = await verifyOwnerLoginCode(PHONE, "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("no_code")
  })
})
