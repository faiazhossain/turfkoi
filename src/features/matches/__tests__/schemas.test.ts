import { describe, expect, it } from "vitest"

import {
  addGuestSchema,
  assignRecorderSchema,
  claimOpponentSideSchema,
  createMatchSchema,
  logMatchEventSchema,
} from "../schemas"

const BOOKING_ID = "0f0e8d7c-6b5a-4938-8271-6a5b4c3d2e1f"
const MATCH_ID = "3f2e3d4c-5b6a-4789-9a0b-cdef12345678"
const PLAYER_ID = "2f2e3d4c-5b6a-4789-9a0b-cdef12345678"

describe("createMatchSchema", () => {
  it("accepts a booking-first creation (no team concept)", () => {
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      matchType: "sevens",
      squadSize: 10,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a teamId — teams left the match flow", () => {
    // Zod strips unknown keys, so a passing parse must not carry teamId.
    const result = createMatchSchema.safeParse({
      bookingId: BOOKING_ID,
      teamId: "not-a-uuid",
      matchType: "fives",
      squadSize: 8,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).not.toHaveProperty("teamId")
  })

  it("requires bookingId", () => {
    const result = createMatchSchema.safeParse({
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

describe("claimOpponentSideSchema", () => {
  it("accepts a count-first declaration (claimant included)", () => {
    const result = claimOpponentSideSchema.safeParse({
      matchId: MATCH_ID,
      playerCount: 6,
    })
    expect(result.success).toBe(true)
  })

  it("requires matchId and playerCount", () => {
    expect(claimOpponentSideSchema.safeParse({ matchId: MATCH_ID }).success).toBe(false)
    expect(claimOpponentSideSchema.safeParse({ playerCount: 3 }).success).toBe(false)
  })

  it("rejects playerCount below 1 or above the global squad max", () => {
    for (const playerCount of [0, -2, 1.5, 19]) {
      const result = claimOpponentSideSchema.safeParse({
        matchId: MATCH_ID,
        playerCount,
      })
      expect(result.success).toBe(false)
    }
  })
})

describe("addGuestSchema", () => {
  it("accepts a name-only entry (everything else optional)", () => {
    const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBeUndefined()
      expect(result.data.position).toBeUndefined()
      expect(result.data.jerseyNumber).toBeUndefined()
    }
  })

  it("normalizes phones to the canonical +880 form", () => {
    for (const phone of ["01712345678", "8801712345678", "+8801712345678"]) {
      const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", phone })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.phone).toBe("+8801712345678")
    }
  })

  it("maps an empty phone field to unset", () => {
    const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", phone: "  " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.phone).toBeUndefined()
  })

  it("rejects a non-BD phone with the dictionary key", () => {
    const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", phone: "12345" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("matches.errors.phoneInvalid")
    }
  })

  it("accepts canonical positions and maps an empty field to unset", () => {
    const ok = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", position: "striker" })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.position).toBe("striker")
    const empty = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", position: "" })
    expect(empty.success).toBe(true)
    if (empty.success) expect(empty.data.position).toBeUndefined()
  })

  it("rejects non-field positions (\"any\" is availability, not a position)", () => {
    for (const position of ["any", "MID", "bench"]) {
      const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", position })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("matches.errors.guestPositionInvalid")
      }
    }
  })

  it("accepts jersey numbers 0 and 99 (numeric strings coerce)", () => {
    for (const jerseyNumber of [0, 99, "10"]) {
      const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", jerseyNumber })
      expect(result.success).toBe(true)
      if (result.success && jerseyNumber === "10") {
        expect(result.data.jerseyNumber).toBe(10)
      }
    }
  })

  it("rejects out-of-range / non-integer / non-numeric jersey numbers with the dictionary key", () => {
    for (const jerseyNumber of [-1, 100, 1.5, "abc"]) {
      const result = addGuestSchema.safeParse({ matchId: MATCH_ID, name: "Rakib", jerseyNumber })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("matches.errors.guestJerseyInvalid")
      }
    }
  })

  it("bounds the name (1..60)", () => {
    expect(addGuestSchema.safeParse({ matchId: MATCH_ID, name: "" }).success).toBe(false)
    expect(addGuestSchema.safeParse({ matchId: MATCH_ID, name: "  " }).success).toBe(false)
    expect(
      addGuestSchema.safeParse({ matchId: MATCH_ID, name: "a".repeat(61) }).success
    ).toBe(false)
  })
})

describe("logMatchEventSchema", () => {
  const base = {
    matchId: MATCH_ID,
    eventType: "goal" as const,
    playerRef: `p-${PLAYER_ID}`,
  }

  it("accepts a stat event with a roster ref and no note", () => {
    expect(logMatchEventSchema.safeParse(base).success).toBe(true)
  })

  it("accepts a player-less note and an empty note field", () => {
    expect(
      logMatchEventSchema.safeParse({
        matchId: MATCH_ID,
        eventType: "note",
        note: "  ভালো খেলা  ",
      }).success
    ).toBe(true)
    expect(
      logMatchEventSchema.safeParse({
        matchId: MATCH_ID,
        eventType: "save",
        playerRef: `g-${PLAYER_ID}`,
        note: "",
      }).success
    ).toBe(true)
  })

  it("rejects malformed player refs with the dictionary key", () => {
    const result = logMatchEventSchema.safeParse({
      ...base,
      playerRef: `x-${PLAYER_ID}`,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "matches.errors.playerNotInMatch"
      )
    }
  })

  it("bounds the note (240 chars) with the dictionary key", () => {
    const result = logMatchEventSchema.safeParse({
      ...base,
      note: "a".repeat(241),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("matches.errors.noteTooLong")
    }
  })
})

describe("assignRecorderSchema", () => {
  it("accepts a recorder id and an explicit null (clear)", () => {
    expect(
      assignRecorderSchema.safeParse({ matchId: MATCH_ID, recorderId: PLAYER_ID })
        .success
    ).toBe(true)
    expect(
      assignRecorderSchema.safeParse({ matchId: MATCH_ID, recorderId: null })
        .success
    ).toBe(true)
  })

  it("rejects a non-uuid recorder", () => {
    expect(
      assignRecorderSchema.safeParse({ matchId: MATCH_ID, recorderId: "abc" })
        .success
    ).toBe(false)
  })
})
