import { z } from "zod"

import type { NotificationType } from "./types"

/**
 * Runtime validation for notification payloads. Rows read back from the DB
 * carry untyped jsonb — the list renderer parses each row's payload against
 * the schema for its `type` so a malformed or legacy row degrades to a
 * generic notification instead of crashing the UI.
 */
export const notificationPayloadSchemas = {
  "turf_application.submitted": z.object({
    turfName: z.string(),
    contactName: z.string(),
    city: z.string().nullish(),
  }),
  "turf_application.approved": z.object({
    turfName: z.string(),
    slug: z.string(),
  }),
  "turf_application.rejected": z.object({
    turfName: z.string(),
  }),
  "booking.confirmed": z.object({
    bookingId: z.string(),
    turfName: z.string(),
    date: z.string(),
    startTime: z.string(),
  }),
  "booking.received": z.object({
    bookingId: z.string(),
    turfName: z.string(),
    date: z.string(),
    startTime: z.string(),
  }),
  "booking.cancelled": z.object({
    bookingId: z.string(),
    turfName: z.string(),
    date: z.string(),
    startTime: z.string(),
    refundAmount: z.number().optional(),
  }),
} satisfies Record<NotificationType, z.ZodType>

export type NotificationPayloadInput = {
  [K in NotificationType]: z.input<(typeof notificationPayloadSchemas)[K]>
}[NotificationType]
