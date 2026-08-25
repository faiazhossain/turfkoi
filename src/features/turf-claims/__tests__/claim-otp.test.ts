import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"

/**
 * Claim OTP flow unit tests. The db is mocked with chainable builders —
 * these pin the minting, attempt/lock, and consume rules without a
 * database (same no-DB approach as auth.test.ts).
 */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

// --- @/db mock: every query is a thenable chain terminating at limit() ---
type Rows = Record<string, unknown>[]
let selectQueue: Rows[] = []
let updateCalls: { table: unknown; set: unknown; where: unknown }[] = []
let insertValues: unknown[] = []

function queryFor(rows: Rows) {
  const q: Record<string, unknown> = {}
  const end = () => Promise.resolve(rows)
  q.from = vi.fn(() => q)
  q.innerJoin = vi.fn(() => q)
  q.where = vi.fn(() => q)
  q.orderBy = vi.fn(() => q)
  q.set = vi.fn(() => q)
  q.values = vi.fn(() => q)
  q.limit = vi.fn(end)
  q.returning = vi.fn(end)
  return q
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => queryFor(selectQueue.shift() ?? [])),
    update: vi.fn((table: unknown) => {
      const q = queryFor([{ id: "updated" }])
      q.set = vi.fn((set: unknown) => {
        updateCalls.push({ table, set, where: null })
        return q
      })
      return q
    }),
    insert: vi.fn((table: unknown) => {
      const q = queryFor([{ id: "inserted" }])
      q.values = vi.fn((v: unknown) => {
        insertValues.push(v)
        return q
      })
      return q
    }),
  },
}))

vi.mock("@/features/auth/users", () => ({
  getUserByPhone: vi.fn(async () => null),
  getUserByEmail: vi.fn(async () => null),
}))

import { createClaimInvite, verifyClaimOtp } from "../invites"
import { generateSimplePassword } from "../owner-account"

beforeEach(() => {
  selectQueue = []
  updateCalls = []
  insertValues = []
  vi.clearAllMocks()
})

function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    targetPhone: "+8801712345678",
    otpHash: sha256("123456"),
    otpAttempts: 0,
    otpLockedUntil: null,
    otpConsumedAt: null,
    ...overrides,
  }
}

function resolvedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    turfId: "turf-1",
    expiresAt: new Date(Date.now() + 86_400_000),
    claimedAt: null,
    revokedAt: null,
    targetPhone: "+8801712345678",
    turfOwnerId: null,
    ...overrides,
  }
}

describe("createClaimInvite", () => {
  it("mints and stores a hashed dev OTP with the normalized phone", async () => {
    const { token, otp } = await createClaimInvite(
      "admin-1",
      "turf-1",
      undefined,
      "01712345678"
    )
    expect(otp).toBe("123456") // fixed in non-production
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const inserted = insertValues[0] as Record<string, unknown>
    expect(inserted.targetPhone).toBe("+8801712345678")
    expect(inserted.otpHash).toBe(sha256("123456"))
  })

  it("stores no OTP when no phone is given", async () => {
    await createClaimInvite("admin-1", "turf-1")
    const inserted = insertValues[0] as Record<string, unknown>
    expect(inserted.targetPhone).toBeNull()
    expect(inserted.otpHash).toBeNull()
  })
})

describe("verifyClaimOtp", () => {
  it("succeeds on the right code and reports the phone", async () => {
    selectQueue = [[resolvedRow()], [inviteRow()]]
    const res = await verifyClaimOtp("a".repeat(43), "123456")
    expect(res).toEqual({
      ok: true,
      inviteId: "invite-1",
      turfId: "turf-1",
      phone: "+8801712345678",
    })
    // consumed via conditional update
    expect(updateCalls.length).toBe(1)
  })

  it("counts attempts and reports how many are left", async () => {
    selectQueue = [[resolvedRow()], [inviteRow({ otpAttempts: 2 })]]
    const res = await verifyClaimOtp("a".repeat(43), "000000")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe("invalid")
      expect(res.attemptsLeft).toBe(2)
    }
  })

  it("locks at 5 wrong attempts", async () => {
    selectQueue = [[resolvedRow()], [inviteRow({ otpAttempts: 4 })]]
    const res = await verifyClaimOtp("a".repeat(43), "000000")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("locked")
    const lockUpdate = updateCalls[0]?.set as Record<string, unknown>
    expect(lockUpdate.otpLockedUntil).toBeInstanceOf(Date)
  })

  it("rejects a consumed code", async () => {
    selectQueue = [
      [resolvedRow()],
      [inviteRow({ otpConsumedAt: new Date() })],
    ]
    const res = await verifyClaimOtp("a".repeat(43), "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("consumed")
  })

  it("rejects an active lock before checking the code", async () => {
    selectQueue = [
      [resolvedRow()],
      [inviteRow({ otpLockedUntil: new Date(Date.now() + 60_000) })],
    ]
    const res = await verifyClaimOtp("a".repeat(43), "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("locked")
  })

  it("surfaces expired links", async () => {
    selectQueue = [
      [resolvedRow({ expiresAt: new Date(Date.now() - 1_000) })],
    ]
    const res = await verifyClaimOtp("a".repeat(43), "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("expired")
  })

  it("reports no_otp for phoneless invites", async () => {
    selectQueue = [
      [resolvedRow({ targetPhone: null })],
      [inviteRow({ targetPhone: null, otpHash: null })],
    ]
    const res = await verifyClaimOtp("a".repeat(43), "123456")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("no_otp")
  })
})

describe("generateSimplePassword", () => {
  it("matches the xxx-xxx-xxx letters-only shape", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSimplePassword()).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/)
    }
  })

  it("avoids the 0/O and 1/l trap characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSimplePassword()).not.toMatch(/[oil01]/)
    }
  })
})
