import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * getTurfAdminDetail (turfkoi-2fw.2): the admin cockpit's single fetch —
 * turf row + owner phone (left join, seeded turfs have none) + lifetime
 * booking count for the danger zone. No-DB chainable mocks, same as
 * turf-controls.test.ts.
 */

type Rows = Record<string, unknown>[]
let selectQueue: Rows[] = []

function queryFor(rows: Rows) {
  const q: Record<string, unknown> = {}
  const end = () => Promise.resolve(rows)
  // Drizzle query builders are thenable — the count query awaits the chain
  // without calling .limit(), so the mock must be awaitable too.
  const promise = end()
  q.then = promise.then.bind(promise)
  q.from = vi.fn(() => q)
  q.leftJoin = vi.fn(() => q)
  q.where = vi.fn(() => q)
  q.limit = vi.fn(end)
  return q
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => queryFor(selectQueue.shift() ?? [])),
  },
}))

import { getTurfAdminDetail } from "../queries"

const TURF = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "test-turf",
  name: "Test Turf",
  ownerId: "00000000-0000-4000-8000-000000000002",
  isVerified: true,
  isActive: true,
}

beforeEach(() => {
  selectQueue = []
  vi.clearAllMocks()
})

describe("getTurfAdminDetail", () => {
  it("returns null for a missing turf", async () => {
    selectQueue = [[]]
    const res = await getTurfAdminDetail(TURF.id)
    expect(res).toBeNull()
  })

  it("returns turf, owner phone, and booking count for an owned turf", async () => {
    selectQueue = [
      [{ turf: TURF, ownerPhone: "+8801712345678" }],
      [{ count: 4 }],
    ]
    const res = await getTurfAdminDetail(TURF.id)
    expect(res).toEqual({
      turf: TURF,
      ownerPhone: "+8801712345678",
      bookingCount: 4,
    })
  })

  it("normalizes a missing owner (seeded turf) to null phone", async () => {
    selectQueue = [
      [{ turf: { ...TURF, ownerId: null }, ownerPhone: null }],
      [{ count: 0 }],
    ]
    const res = await getTurfAdminDetail(TURF.id)
    expect(res?.ownerPhone).toBeNull()
    expect(res?.bookingCount).toBe(0)
  })
})
