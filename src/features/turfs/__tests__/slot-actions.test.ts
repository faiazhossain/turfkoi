import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"

/**
 * Slot system P1 action tests: addSlotAction overlap/past-date/auth paths and
 * saveScheduleAction validation + activation semantics. Same chainable-mock
 * approach as turf-controls.test.ts — no database. The materializer is mocked
 * because its safety contract is covered directly in slot-planning.test.ts.
 */

type Rows = Record<string, unknown>[]

let selectQueue: Rows[] = []
let insertCalls: { table: unknown; values: unknown }[] = []
let insertReturnQueue: Rows[] = []
let updateReturnQueue: Rows[] = []
let updateCalls: Array<{ table: unknown; set: Record<string, unknown> }> = []
let deleteCalls: { table: unknown }[] = []
let revalidateCalls: string[] = []
let currentUser: { id: string; roles: string[] } | null = null
let materializeMock: Mock

function queryFor(rows: Rows) {
  const q: Record<string, unknown> = {}
  const end = () => Promise.resolve(rows)
  const promise = end()
  q.then = promise.then.bind(promise)
  q.from = vi.fn(() => q)
  q.innerJoin = vi.fn(() => q)
  q.where = vi.fn(() => q)
  q.orderBy = vi.fn(() => q)
  q.limit = vi.fn(end)
  q.returning = vi.fn(() => Promise.resolve(insertReturnQueue.shift() ?? []))
  q.onConflictDoNothing = vi.fn(() => q)
  return q
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => queryFor(selectQueue.shift() ?? [])),
    insert: vi.fn((table: unknown) => {
      const q = queryFor([])
      q.values = vi.fn((values: unknown) => {
        insertCalls.push({ table, values })
        return q
      })
      q.onConflictDoUpdate = vi.fn(() => q)
      return q
    }),
    update: vi.fn((table: unknown) => {
      const q = queryFor([])
      q.set = vi.fn((set: Record<string, unknown>) => {
        updateCalls.push({ table, set })
        return q
      })
      q.returning = vi.fn(() =>
        Promise.resolve(updateReturnQueue.shift() ?? [{ id: "updated" }])
      )
      return q
    }),
    delete: vi.fn((table: unknown) => {
      const q = queryFor([])
      const del = queryFor([])
      q.where = vi.fn(() => del)
      deleteCalls.push({ table })
      return q
    }),
  },
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((path: string) => {
    revalidateCalls.push(path)
  }),
}))

vi.mock("@/features/turfs/materialize", () => ({
  materializeTurfSchedule: (...args: unknown[]) => materializeMock(...args),
}))

import {
  activateScheduleAction,
  addSlotAction,
  clearDateExceptionAction,
  saveScheduleAction,
  setDateExceptionAction,
} from "@/features/turfs/actions"
import {
  turfSlots,
  turfSchedules,
  turfScheduleSections,
  turfDateExceptions,
} from "@/db/schema"

const TURF_ID = "00000000-0000-0000-0000-000000000001"
const OWNER_ID = "00000000-0000-0000-0000-000000000002"
const SCHED_ID = "0056ddcb-866e-4a48-a82f-f72635a38129"

function signInAs(roles: string[]) {
  currentUser = { id: OWNER_ID, roles }
}
const turfRow = () => [{ ownerId: OWNER_ID }]

/** Narrows a failed ActionResult so `.error` is readable. */
function failure(res: { ok: boolean; error?: string }): string {
  if (res.ok) throw new Error("expected the action to fail")
  return res.error ?? ""
}

beforeEach(() => {
  vi.clearAllMocks()
  selectQueue = []
  insertCalls = []
  insertReturnQueue = []
  updateReturnQueue = []
  updateCalls = []
  deleteCalls = []
  revalidateCalls = []
  currentUser = null
  materializeMock = vi.fn(async () => ({
    applied: true,
    inserted: 0,
    updated: 0,
    deleted: 0,
    conflicts: [],
    keptManual: 0,
  }))
  selectQueue.push(turfRow())
})

const validSlot = {
  date: "2099-03-06",
  startTime: "21:00",
  durationMinutes: 90,
  price: 1500,
}

const validSchedule = {
  name: "Regular week",
  isActive: true,
  sections: [
    { dayOfWeek: 0, startTime: "17:00", endTime: "23:00", slotMinutes: 60, gapMinutes: 10, price: 1200 },
    { dayOfWeek: 5, startTime: "08:00", endTime: "12:00", slotMinutes: 60, gapMinutes: 0, price: 800 },
  ],
}

describe("addSlotAction", () => {
  it("rejects when not signed in", async () => {
    const res = await addSlotAction(TURF_ID, validSlot)
    expect(failure(res)).toContain("signed in")
  })

  it("rejects a past date", async () => {
    signInAs(["turf_owner"])
    const res = await addSlotAction(TURF_ID, { ...validSlot, date: "2020-01-01" })
    expect(failure(res)).toContain("future")
  })

  it("rejects a slot overlapping an existing one on the same date", async () => {
    signInAs(["turf_owner"])
    selectQueue.push([
      { date: "2099-03-06", startTime: "21:30:00", durationMinutes: 60 },
    ])
    const res = await addSlotAction(TURF_ID, validSlot)
    expect(failure(res)).toContain("21:30")
    expect(insertCalls).toEqual([])
  })

  it("rejects a slot under the previous night's midnight spillover", async () => {
    signInAs(["turf_owner"])
    // Yesterday 23:30/90 spills into 01:00 today; today's 00:30 collides.
    selectQueue.push([
      { date: "2099-03-05", startTime: "23:30:00", durationMinutes: 90 },
    ])
    const res = await addSlotAction(TURF_ID, { ...validSlot, startTime: "00:30" })
    expect(failure(res)).toContain("23:30")
    expect(insertCalls).toEqual([])
  })

  it("inserts a clean slot as a manual row", async () => {
    signInAs(["turf_owner"])
    insertReturnQueue.push([{ startTime: "21:00" }])
    const res = await addSlotAction(TURF_ID, validSlot)
    expect(res.ok).toBe(true)
    expect(insertCalls).toHaveLength(1)
    const { table, values } = insertCalls[0]!
    expect(table).toBe(turfSlots)
    expect(values).toMatchObject({
      date: "2099-03-06",
      startTime: "21:00",
      durationMinutes: 90,
      source: "manual",
      status: "available",
    })
  })

  it("reports a duplicate start time when nothing was inserted", async () => {
    signInAs(["turf_owner"])
    // onConflictDoNothing swallows the PK clash -> empty returning.
    insertReturnQueue.push([])
    const res = await addSlotAction(TURF_ID, validSlot)
    expect(failure(res)).toContain("already starts")
  })
})

describe("saveScheduleAction", () => {
  it("rejects overlapping sections at validation", async () => {
    signInAs(["turf_owner"])
    const res = await saveScheduleAction(TURF_ID, {
      ...validSchedule,
      sections: [
        validSchedule.sections[0]!,
        { dayOfWeek: 0, startTime: "22:00", endTime: "23:30", slotMinutes: 60, gapMinutes: 0, price: 1000 },
      ],
    })
    expect(failure(res)).toContain("overlaps")
    expect(materializeMock).not.toHaveBeenCalled()
  })

  it("rejects a non-owner", async () => {
    signInAs(["player"])
    const res = await saveScheduleAction(TURF_ID, validSchedule)
    expect(failure(res)).toContain("permission")
  })

  it("deactivates sibling schedules, inserts sections, materializes", async () => {
    signInAs(["turf_owner"])
    insertReturnQueue.push([{ id: "sched-1" }])
    const res = await saveScheduleAction(TURF_ID, validSchedule)
    if (!res.ok) throw new Error(`expected success, got: ${res.error}`)

    const deactivate = updateCalls.find(
      (c) => c.table === turfSchedules && c.set.isActive === false
    )
    expect(deactivate).toBeDefined()

    const sectionInsert = insertCalls.find(
      (c) => c.table === turfScheduleSections
    )
    expect(sectionInsert).toBeDefined()
    const rows = sectionInsert!.values as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      dayOfWeek: 0,
      startTime: "17:00",
      slotMinutes: 60,
      gapMinutes: 10,
      price: "1200.00",
    })

    expect(materializeMock).toHaveBeenCalledWith(TURF_ID)
    expect(res.materialized).toBeDefined()
  })

  it("does not materialize an inactive schedule save", async () => {
    signInAs(["turf_owner"])
    insertReturnQueue.push([{ id: "sched-2" }])
    const res = await saveScheduleAction(TURF_ID, { ...validSchedule, isActive: false })
    expect(res.ok).toBe(true)
    expect(materializeMock).not.toHaveBeenCalled()
  })
})

describe("setDateExceptionAction", () => {
  it("rejects a closed day that also carries a price rule", async () => {
    signInAs(["turf_owner"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2099-03-20",
      isClosed: true,
      priceMode: "multiplier",
      priceValue: 1.25,
    })
    expect(failure(res)).toContain("can't also carry")
    expect(insertCalls).toEqual([])
  })

  it("rejects a price rule without a value", async () => {
    signInAs(["turf_owner"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2099-03-20",
      isClosed: false,
      priceMode: "multiplier",
    })
    expect(failure(res)).toContain("Provide the value")
  })

  it("rejects an out-of-range multiplier", async () => {
    signInAs(["turf_owner"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2099-03-20",
      isClosed: false,
      priceMode: "multiplier",
      priceValue: 5,
    })
    expect(failure(res)).toContain("between 0.5 and 3")
  })

  it("rejects a past date", async () => {
    signInAs(["turf_owner"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2020-01-01",
      isClosed: true,
    })
    expect(failure(res)).toContain("future")
  })

  it("rejects a non-owner", async () => {
    signInAs(["player"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2099-03-20",
      isClosed: true,
    })
    expect(failure(res)).toContain("permission")
  })

  it("upserts a closure and rematerializes", async () => {
    signInAs(["turf_owner"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2099-03-20",
      isClosed: true,
      reason: "Eid-ul-Fitr",
    })
    expect(res.ok).toBe(true)
    const insert = insertCalls.find((c) => c.table === turfDateExceptions)
    expect(insert).toBeDefined()
    expect(insert!.values).toMatchObject({
      turfId: TURF_ID,
      date: "2099-03-20",
      isClosed: true,
      reason: "Eid-ul-Fitr",
      priceMode: null,
      priceValue: null,
    })
    expect(materializeMock).toHaveBeenCalledWith(TURF_ID)
  })

  it("upserts a holiday multiplier with a numeric-string price", async () => {
    signInAs(["turf_owner"])
    const res = await setDateExceptionAction(TURF_ID, {
      date: "2099-03-26",
      isClosed: false,
      priceMode: "multiplier",
      priceValue: 1.25,
    })
    expect(res.ok).toBe(true)
    const insert = insertCalls.find((c) => c.table === turfDateExceptions)
    expect(insert!.values).toMatchObject({
      isClosed: false,
      priceMode: "multiplier",
      priceValue: "1.25",
    })
  })
})

describe("clearDateExceptionAction", () => {
  it("deletes the exception row and rematerializes", async () => {
    signInAs(["turf_owner"])
    const res = await clearDateExceptionAction(TURF_ID, { date: "2099-03-20" })
    expect(res.ok).toBe(true)
    expect(
      deleteCalls.some((c) => c.table === turfDateExceptions)
    ).toBe(true)
    expect(materializeMock).toHaveBeenCalledWith(TURF_ID)
  })

  it("rejects when not signed in", async () => {
    const res = await clearDateExceptionAction(TURF_ID, { date: "2099-03-20" })
    expect(failure(res)).toContain("signed in")
  })
})

describe("activateScheduleAction", () => {
  it("rejects an inverted effective window", async () => {
    signInAs(["turf_owner"])
    const res = await activateScheduleAction(TURF_ID, {
      scheduleId: SCHED_ID,
      effectiveFrom: "2099-03-20",
      effectiveTo: "2099-03-01",
    })
    expect(failure(res)).toContain("on or after")
    expect(materializeMock).not.toHaveBeenCalled()
  })

  it("rejects a non-owner", async () => {
    signInAs(["player"])
    const res = await activateScheduleAction(TURF_ID, {
      scheduleId: SCHED_ID,
    })
    expect(failure(res)).toContain("permission")
  })

  it("deactivates all schedules, activates the target, materializes", async () => {
    signInAs(["turf_owner"])
    updateReturnQueue.push([{ id: "sched-ramadan" }])
    const res = await activateScheduleAction(TURF_ID, {
      scheduleId: SCHED_ID,
      effectiveFrom: "2099-02-19",
      effectiveTo: "2099-03-20",
    })
    if (!res.ok) throw new Error(`expected success, got: ${res.error}`)

    const deactivateAll = updateCalls.find(
      (c) => c.table === turfSchedules && c.set.isActive === false
    )
    expect(deactivateAll).toBeDefined()

    const activate = updateCalls.find(
      (c) => c.table === turfSchedules && c.set.isActive === true
    )
    expect(activate).toBeDefined()
    expect(activate!.set).toMatchObject({
      effectiveFrom: "2099-02-19",
      effectiveTo: "2099-03-20",
    })

    expect(materializeMock).toHaveBeenCalledWith(TURF_ID)
    expect(res.materialized).toBeDefined()
  })

  it("reports an unknown schedule", async () => {
    signInAs(["turf_owner"])
    updateReturnQueue.push([]) // update returns nothing -> not found
    const res = await activateScheduleAction(TURF_ID, {
      scheduleId: SCHED_ID,
    })
    expect(failure(res)).toContain("not found")
    expect(materializeMock).not.toHaveBeenCalled()
  })
})
