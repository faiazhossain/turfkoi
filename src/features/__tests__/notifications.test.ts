import { describe, it, expect } from "vitest"

import { en } from "@/i18n/dictionaries/en"
import { translate } from "@/i18n/translate"

import { buildNotificationRows } from "../notifications/rows"
import { notificationPayloadSchemas } from "../notifications/schemas"
import {
  NOTIFICATION_TYPES,
  getNotificationConfig,
  type NotificationPayloads,
} from "../notifications/types"

const SAMPLE_PAYLOADS: {
  [K in keyof NotificationPayloads]: NotificationPayloads[K]
} = {
  "turf_application.submitted": {
    turfName: "Dhanmondi Arena",
    contactName: "Rahim",
    city: "Dhaka",
  },
  "turf_application.approved": {
    turfName: "Dhanmondi Arena",
    slug: "dhanmondi-arena",
  },
  "turf_application.rejected": { turfName: "Dhanmondi Arena" },
  "turf.verified": {
    turfId: "t-1",
    turfName: "Dhanmondi Arena",
  },
  "turf.unverified": {
    turfId: "t-1",
    turfName: "Dhanmondi Arena",
  },
  "booking.confirmed": {
    bookingId: "b-1",
    turfName: "Dhanmondi Arena",
    date: "2026-08-24",
    startTime: "20:00",
  },
  "booking.received": {
    bookingId: "b-1",
    turfName: "Dhanmondi Arena",
    date: "2026-08-24",
    startTime: "20:00",
  },
  "booking.cancelled": {
    bookingId: "b-1",
    turfName: "Dhanmondi Arena",
    date: "2026-08-24",
    startTime: "20:00",
    refundAmount: 250,
  },
  "erp.bill_due": { name: "Electricity bill", dueDate: "2026-08-30" },
  "erp.salary_pending": { count: 2 },
  "erp.premium_approved": { months: 3 },
  "erp.premium_rejected": { reason: "Transaction ID not found" },
  "match.invite_received": {
    matchId: "m-1",
    matchType: "fives",
    kickoffAt: "2026-08-30T14:00:00.000Z",
    turfName: "Dhanmondi Arena",
    captainName: "Rahim",
  },
  "match.invite_accepted": { matchId: "m-1", playerName: "Karim" },
  "match.invite_declined": { matchId: "m-1", playerName: "Karim" },
  "match.join_requested": {
    matchId: "m-1",
    playerName: "Karim",
    turfName: "Dhanmondi Arena",
  },
  "match.opponent_claimed": {
    matchId: "m-1",
    playerName: "Karim",
    turfName: "Dhanmondi Arena",
  },
  "match.challenge_received": {
    matchId: "m-1",
    teamName: "Dhaka Strikers",
    captainName: "Karim",
    turfName: "Dhanmondi Arena",
  },
  "match.challenge_accepted": {
    matchId: "m-1",
    teamName: "Dhaka Strikers",
  },
  "match.challenge_declined": {
    matchId: "m-1",
    teamName: "Dhaka Strikers",
  },
  "friend.request_received": { friendName: "Rahim" },
  "friend.request_accepted": { friendName: "Karim" },
}

describe("notification registry", () => {
  it("every type defines priority, audience, icon, and renderers", () => {
    for (const [type, config] of Object.entries(NOTIFICATION_TYPES)) {
      expect(["info", "transactional", "critical"], type).toContain(
        config.priority
      )
      expect(["player", "turf_owner", "admin"], type).toContain(config.audience)
      expect(config.icon, type).toBeDefined()
      expect(typeof config.title, type).toBe("function")
      expect(typeof config.body, type).toBe("function")
    }
  })

  it("every sample payload resolves to a translated, non-empty title and body", () => {
    for (const [type, payload] of Object.entries(SAMPLE_PAYLOADS)) {
      const config = getNotificationConfig(type)
      expect(config, type).toBeDefined()
      const title = config!.title(payload as never)
      // Registry returns dictionary keys; resolve through the English
      // dictionary so a missing key fails here (translate echoes unknown keys).
      const rendered = translate(en, title.key, title.params)
      expect(rendered, type).not.toBe(title.key)
      expect(rendered.length, type).toBeGreaterThan(0)
      const body = config!.body(payload as never)
      if (body) {
        const renderedBody = translate(en, body.key, body.params)
        expect(renderedBody, type).not.toBe(body.key)
      }
    }
  })

  it("interpolates params into translated strings", () => {
    const config = getNotificationConfig("booking.confirmed")!
    const title = config.title(SAMPLE_PAYLOADS["booking.confirmed"] as never)
    expect(translate(en, title.key, title.params)).toBe(
      "Booking confirmed at Dhanmondi Arena"
    )
    const cancelled = getNotificationConfig("booking.cancelled")!
    const body = cancelled.body(SAMPLE_PAYLOADS["booking.cancelled"] as never)!
    expect(translate(en, body.key, body.params)).toBe(
      "2026-08-24 • 20:00 • refund ৳250"
    )
  })

  it("contested invites render the accept-fast body variant", () => {
    const config = getNotificationConfig("match.invite_received")!
    const payload = { ...SAMPLE_PAYLOADS["match.invite_received"], contested: true }
    // Optional flag round-trips through the zod schema.
    expect(
      notificationPayloadSchemas["match.invite_received"].safeParse(payload).success
    ).toBe(true)
    const body = config.body(payload as never)!
    expect(body.key).toBe("notifications.matchInviteReceivedContestedBody")
    const rendered = translate(en, body.key, body.params)
    expect(rendered).toContain("Dhanmondi Arena")
    expect(rendered).not.toBe(translate(en, "notifications.matchInviteReceivedBody", body.params))
  })

  it("hrefs are internal routes starting with /", () => {
    for (const [type, payload] of Object.entries(SAMPLE_PAYLOADS)) {
      const href = getNotificationConfig(type)?.href?.(payload as never)
      if (href !== undefined) expect(href.startsWith("/"), type).toBe(true)
    }
  })

  it("unknown types resolve to no config (generic fallback)", () => {
    expect(getNotificationConfig("nope.not_a_type")).toBeUndefined()
  })
})

describe("notification payload schemas", () => {
  it("covers exactly the registry keys", () => {
    expect(Object.keys(notificationPayloadSchemas).sort()).toEqual(
      Object.keys(NOTIFICATION_TYPES).sort()
    )
  })

  it("round-trips every sample payload", () => {
    for (const [type, payload] of Object.entries(SAMPLE_PAYLOADS)) {
      const schema =
        notificationPayloadSchemas[
          type as keyof typeof notificationPayloadSchemas
        ]
      const parsed = schema.safeParse(payload)
      expect(parsed.success, type).toBe(true)
      if (parsed.success) expect(parsed.data).toEqual(payload)
    }
  })

  it("rejects malformed payloads", () => {
    const parsed = notificationPayloadSchemas["turf_application.approved"]
      .safeParse({ turfName: 42 })
    expect(parsed.success).toBe(false)
  })
})

describe("buildNotificationRows", () => {
  it("fans one notification out to one row per recipient", () => {
    const rows = buildNotificationRows(
      {
        type: "booking.confirmed",
        payload: SAMPLE_PAYLOADS["booking.confirmed"],
        entityType: "booking",
        entityId: "b-1",
      },
      ["u-1", "u-2", "u-3"]
    )
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.userId)).toEqual(["u-1", "u-2", "u-3"])
    for (const row of rows) {
      expect(row.type).toBe("booking.confirmed")
      // Priority comes from the registry, not the caller.
      expect(row.priority).toBe("transactional")
      expect(row.entityType).toBe("booking")
      expect(row.entityId).toBe("b-1")
    }
  })

  it("defaults entity columns to null when absent", () => {
    const [row] = buildNotificationRows(
      { type: "turf_application.rejected", payload: { turfName: "X" } },
      ["u-1"]
    )
    expect(row.entityType).toBeNull()
    expect(row.entityId).toBeNull()
    expect(row.priority).toBe("info")
  })
})
