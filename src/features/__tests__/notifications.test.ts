import { describe, it, expect } from "vitest"

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

  it("every sample payload renders a non-empty title", () => {
    for (const [type, payload] of Object.entries(SAMPLE_PAYLOADS)) {
      const config = getNotificationConfig(type)
      expect(config, type).toBeDefined()
      expect(config!.title(payload as never).length, type).toBeGreaterThan(0)
    }
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
