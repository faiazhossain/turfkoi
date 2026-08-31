import { describe, expect, it } from "vitest"

import { createMatchSchema } from "../schemas"

const BOOKING_ID = "0f0e8d7c-6b5a-4938-8271-6a5b4c3d2e1f"
const TEAM_ID = "1f2e3d4c-5b6a-4789-9a0b-cdef12345678"
const PLAYER_ID = "2f2e3d4c-5b6a-4789-9a0b-cdef12345678"

describe("createMatchSchema", () => {
  it("accepts a team match", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      teamId: TEAM_ID,
      matchType: "sevens",
      squadSize: 10,
    })
    expect(result.success).toBe(true)
  })

  it("accepts a solo match (teamId omitted)", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "fives",
      squadSize: 8,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.teamId).toBeUndefined()
  })

  it("rejects a non-uuid teamId", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      teamId: "not-a-uuid",
      matchType: "fives",
      squadSize: 8,
    })
    expect(result.success).toBe(false)
  })

  it("requires bookingId", () => {
    const result = createMatchSchema.safeParse({
      teamId: TEAM_ID,
      matchType: "fives",
      squadSize: 8,
    })
    expect(result.success).toBe(false)
  })

  it("rejects squadSize below the format's starters", () => {
    // 7v7 = 7 on the field; a squad of 6 can't field a team.
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "sevens",
      squadSize: 6,
    })
    expect(result.success).toBe(false)
  })

  it("rejects squadSize above the format's max", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "fives",
      squadSize: 13,
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown formats", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "twelves",
      squadSize: 12,
    })
    expect(result.success).toBe(false)
  })

  it("accepts a count-first declaration (placeholderCount)", () => {
    // 10-player squad, captain says they already have 7 (incl. themselves).
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "sevens",
      squadSize: 10,
      placeholderCount: 6,
    })
    expect(result.success).toBe(true)
  })

  it("accepts placeholderCount 0 / omitted (full squad = squadSize - 1)", () => {
    for (const payload of [
      { bookingId: BOOKING_ID, matchType: "fives", squadSize: 8, placeholderCount: 0 },
      { bookingId: BOOKING_ID, matchType: "fives", squadSize: 8 },
    ]) {
      const result = createMatchSchema.safeParse(payload)
      expect(result.success).toBe(true)
    }
  })

  it("rejects negative / non-integer / oversized placeholderCount", () => {
    for (const placeholderCount of [-1, 1.5, 18]) {
      const result = createMatchSchema.safeParse({
        bookingId: BOOKING_ID,
        matchType: "fives",
        squadSize: 8,
        placeholderCount,
      })
      expect(result.success).toBe(false)
    }
  })

  it("no longer accepts identity inputs (count-first: identify later)", () => {
    // Friends/phones/guests moved out of creation — the match room owns them.
    // Zod strips unknown keys, so assert they're gone from the parsed data.
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "fives",
      squadSize: 8,
      initialPlayerIds: [PLAYER_ID],
      invitedPhones: ["01712345678"],
      guests: [{ name: "Rakib" }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty("initialPlayerIds")
      expect(result.data).not.toHaveProperty("invitedPhones")
      expect(result.data).not.toHaveProperty("guests")
    }
  })
})
