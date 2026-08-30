import { describe, expect, it } from "vitest"

import { createMatchSchema } from "../schemas"

const BOOKING_ID = "0f0e8d7c-6b5a-4938-8271-6a5b4c3d2e1f"
const TEAM_ID = "1f2e3d4c-5b6a-4789-9a0b-cdef12345678"

describe("createMatchSchema", () => {
  it("accepts a team match", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      teamId: TEAM_ID,
    })
    expect(result.success).toBe(true)
  })

  it("accepts a solo match (teamId omitted)", () => {
    const result = createMatchSchema.safeParse({ bookingId: BOOKING_ID })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.teamId).toBeUndefined()
  })

  it("rejects a non-uuid teamId", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      teamId: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("requires bookingId", () => {
    const result = createMatchSchema.safeParse({ teamId: TEAM_ID })
    expect(result.success).toBe(false)
  })
})
