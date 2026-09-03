import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Turf row controls (turfkoi-2fw.1): admin gating + toggle semantics for
 * setTurfActiveAction / unverifyTurfAction, and the holdSlotAction turf-status
 * gate (deactivated or unverified turfs take no bookings). The db is mocked
 * with chainable builders — same no-DB approach as claim-otp.test.ts; every
 * factory dereferences module state lazily (at call time), so hoisting is safe.
 */

import { turfs } from "@/db/schema"

type Rows = Record<string, unknown>[]
let selectQueue: Rows[] = []
let updateReturnQueue: Rows[] = []
let updateCalls: { table: unknown; set: unknown }[] = []
let insertValues: unknown[] = []
let deleteReturnQueue: Rows[] = []
let deleteError: Error | null = null
let deleteCalls: { table: unknown }[] = []
let revalidateCalls: string[] = []
let logCalls: { evt: string; ctx: unknown }[] = []
// Signed-in identity for getCurrentUser; tests swap this per case.
let currentUser: { id: string; roles: string[] } | null = null

function queryFor(rows: Rows) {
  const q: Record<string, unknown> = {}
  const end = () => Promise.resolve(rows)
  // Drizzle query builders are thenable — the bookings count awaits the
  // chain without calling .limit(), so the mock must be awaitable too.
  const promise = end()
  q.then = promise.then.bind(promise)
  q.from = vi.fn(() => q)
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
    delete: vi.fn((table: unknown) => {
      const q: Record<string, unknown> = {}
      deleteCalls.push({ table })
      q.where = vi.fn(() => q)
      q.returning = vi.fn(() =>
        deleteError
          ? Promise.reject(deleteError)
          : Promise.resolve(deleteReturnQueue.shift() ?? [{ id: "deleted" }])
      )
      return q
    }),
  },
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((path: string) => revalidateCalls.push(path)),
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

// bookings/actions.ts pulls these in; none may run at import time in tests.
vi.mock("@/lib/inngest", () => ({
  scheduleHoldExpiry: vi.fn(async () => {}),
  scheduleSettleAtKickoff: vi.fn(async () => {}),
}))
vi.mock("@/features/notifications/create", () => ({
  createNotifications: vi.fn(async () => {}),
  notifyAdmins: vi.fn(async () => {}),
}))

import { setTurfActiveAction, unverifyTurfAction, deleteTurfAction } from "../actions"
import { holdSlotAction } from "@/features/bookings/actions"

const ADMIN = { id: "admin-1", roles: ["admin"] }
const PLAYER = { id: "player-1", roles: ["player"] }
const TURF_ID = "00000000-0000-4000-8000-000000000001"

function slotRow(overrides: Record<string, unknown> = {}) {
  return {
    slot: {
      id: "s1",
      durationMinutes: 60,
      status: "available",
      date: "2099-01-01",
      startTime: "18:00:00",
    },
    isVerified: true,
    isActive: true,
    ...overrides,
  }
}

const HOLD_INPUT = {
  turfId: TURF_ID,
  date: "2026-09-01",
  startTime: "18:00",
}

beforeEach(() => {
  selectQueue = []
  updateReturnQueue = []
  updateCalls = []
  insertValues = []
  deleteReturnQueue = []
  deleteError = null
  deleteCalls = []
  revalidateCalls = []
  logCalls = []
  currentUser = null
  vi.clearAllMocks()
})

describe("setTurfActiveAction", () => {
  it("rejects callers without the admin role", async () => {
    currentUser = PLAYER
    const res = await setTurfActiveAction({ turfId: TURF_ID, isActive: false })
    expect(res).toEqual({ ok: false, error: "errors.adminOnly" })
    expect(updateCalls.length).toBe(0)
  })

  it("rejects signed-out callers", async () => {
    currentUser = null
    const res = await setTurfActiveAction({ turfId: TURF_ID, isActive: true })
    expect(res).toEqual({ ok: false, error: "errors.notSignedIn" })
  })

  it("deactivates: flags the update, revalidates, logs the audit line", async () => {
    currentUser = ADMIN
    updateReturnQueue = [[{ id: TURF_ID }]]
    const res = await setTurfActiveAction({ turfId: TURF_ID, isActive: false })
    expect(res).toEqual({ ok: true, id: TURF_ID })
    expect(updateCalls[0]?.table).toBe(turfs)
    expect(updateCalls[0]?.set).toMatchObject({ isActive: false })
    expect(revalidateCalls).toContain("/admin/turfs")
    expect(revalidateCalls).toContain("/turfs")
    expect(logCalls.map((l) => l.evt)).toContain("admin.turf_deactivated")
  })

  it("activates and logs turf_activated", async () => {
    currentUser = ADMIN
    updateReturnQueue = [[{ id: TURF_ID }]]
    const res = await setTurfActiveAction({ turfId: TURF_ID, isActive: true })
    expect(res.ok).toBe(true)
    expect(updateCalls[0]?.set).toMatchObject({ isActive: true })
    expect(logCalls.map((l) => l.evt)).toContain("admin.turf_activated")
  })

  it("errors on a missing turf", async () => {
    currentUser = ADMIN
    updateReturnQueue = [[]]
    const res = await setTurfActiveAction({ turfId: TURF_ID, isActive: false })
    expect(res).toEqual({ ok: false, error: "turfs.errors.turfNotFound" })
  })
})

describe("unverifyTurfAction", () => {
  it("unverifies a verified turf and logs it", async () => {
    currentUser = ADMIN
    updateReturnQueue = [[{ id: TURF_ID }]]
    const res = await unverifyTurfAction({ turfId: TURF_ID })
    expect(res).toEqual({ ok: true, id: TURF_ID })
    expect(updateCalls[0]?.table).toBe(turfs)
    expect(updateCalls[0]?.set).toMatchObject({ isVerified: false })
    expect(logCalls.map((l) => l.evt)).toContain("admin.turf_unverified")
  })

  it("rejects non-admins", async () => {
    currentUser = PLAYER
    const res = await unverifyTurfAction({ turfId: TURF_ID })
    expect(res).toEqual({ ok: false, error: "errors.adminOnly" })
  })

  it("reports already-pending or missing turfs without logging", async () => {
    currentUser = ADMIN
    updateReturnQueue = [[]]
    const res = await unverifyTurfAction({ turfId: TURF_ID })
    expect(res).toEqual({
      ok: false,
      error: "admin.errors.turfNotFoundPending",
    })
    expect(logCalls.length).toBe(0)
  })
})

describe("holdSlotAction turf-status gate", () => {
  it("rejects a slot on a deactivated turf without claiming it", async () => {
    currentUser = PLAYER
    selectQueue = [[slotRow({ isActive: false })]]
    const res = await holdSlotAction(HOLD_INPUT)
    expect(res).toEqual({
      ok: false,
      error: "turfs.errors.notTakingBookings",
    })
    expect(updateCalls.length).toBe(0)
    expect(insertValues.length).toBe(0)
  })

  it("rejects a slot on an unverified turf", async () => {
    currentUser = PLAYER
    selectQueue = [[slotRow({ isVerified: false })]]
    const res = await holdSlotAction(HOLD_INPUT)
    expect(res).toEqual({
      ok: false,
      error: "turfs.errors.notTakingBookings",
    })
    expect(updateCalls.length).toBe(0)
  })

  it("still rejects unknown slots", async () => {
    currentUser = PLAYER
    selectQueue = [[]]
    const res = await holdSlotAction(HOLD_INPUT)
    expect(res).toEqual({ ok: false, error: "turfs.errors.slotGone" })
  })

  it("rejects a slot inside the 20-minute booking cutoff", async () => {
    currentUser = PLAYER
    // Dhaka wall time = UTC+6 fixed — shift the epoch and read ISO fields.
    const soon = new Date(Date.now() + 10 * 60 * 1000 + 6 * 60 * 60 * 1000)
    const date = soon.toISOString().slice(0, 10)
    const startTime = soon.toISOString().slice(11, 19)
    selectQueue = [[slotRow({ slot: { id: "s1", durationMinutes: 60, status: "available", date, startTime } })]]
    const res = await holdSlotAction(HOLD_INPUT)
    expect(res).toEqual({ ok: false, error: "turfs.errors.slotCutoff" })
    expect(updateCalls.length).toBe(0)
  })

  it("proceeds when the turf is verified and active", async () => {
    currentUser = PLAYER
    selectQueue = [[slotRow()]]
    updateReturnQueue = [[{ turfId: TURF_ID }]]
    const res = await holdSlotAction(HOLD_INPUT)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.bookingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })
})

describe("deleteTurfAction", () => {
  it("rejects callers without the admin role", async () => {
    currentUser = PLAYER
    const res = await deleteTurfAction({ turfId: TURF_ID })
    expect(res).toEqual({ ok: false, error: "errors.adminOnly" })
    expect(deleteCalls.length).toBe(0)
  })

  it("blocks deletion when the turf has bookings, without deleting", async () => {
    currentUser = ADMIN
    selectQueue = [[{ count: 3 }]]
    const res = await deleteTurfAction({ turfId: TURF_ID })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("admin.errors.turfHasBookings")
      
    }
    expect(deleteCalls.length).toBe(0)
    expect(logCalls.length).toBe(0)
  })

  it("deletes a booking-less turf, logs it, and revalidates", async () => {
    currentUser = ADMIN
    selectQueue = [[{ count: 0 }]]
    deleteReturnQueue = [[{ id: TURF_ID }]]
    const res = await deleteTurfAction({ turfId: TURF_ID })
    expect(res).toEqual({ ok: true, id: TURF_ID })
    expect(deleteCalls[0]?.table).toBe(turfs)
    expect(logCalls.map((l) => l.evt)).toContain("admin.turf_deleted")
    expect(revalidateCalls).toContain("/admin/turfs")
    expect(revalidateCalls).toContain("/turfs")
  })

  it("errors on a missing turf", async () => {
    currentUser = ADMIN
    selectQueue = [[{ count: 0 }]]
    deleteReturnQueue = [[]]
    const res = await deleteTurfAction({ turfId: TURF_ID })
    expect(res).toEqual({ ok: false, error: "turfs.errors.turfNotFound" })
    expect(logCalls.length).toBe(0)
  })

  it("surfaces the FK race (booking landed mid-delete) as a friendly block", async () => {
    currentUser = ADMIN
    selectQueue = [[{ count: 0 }]]
    // Production shape: Drizzle wraps the Neon driver error (SQLSTATE on
    // `cause`, not in the wrapper's message).
    const fkError = Object.assign(
      new Error('db error: foreign key constraint "bookings_turf_id" violated'),
      { code: "23503" }
    )
    const wrapped = new Error(
      `Failed query: delete from "turfs" where "turfs"."id" = $1 returning "id"\nparams: ${TURF_ID}`
    )
    wrapped.name = "DrizzleQueryError"
    wrapped.cause = fkError
    deleteError = wrapped
    const res = await deleteTurfAction({ turfId: TURF_ID })
    expect(res.ok).toBe(false)
    if (!res.ok) 
    expect(logCalls.length).toBe(0)
  })
})
