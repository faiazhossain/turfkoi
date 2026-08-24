import type { ComponentType } from "react"
import {
  InboxIcon,
  MapPinIcon,
  CircleXIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  CalendarXIcon,
} from "lucide-react"

/**
 * Notification type registry (Requirements §31) — the single source of truth
 * for how a notification renders. Payloads are typed per key; zod schemas in
 * ./schemas.ts validate them at runtime when reading rows back from the DB.
 * Keep this module pure (no server-only, no db) so client components and
 * Vitest can import it freely.
 */

export type NotificationPriority = "info" | "transactional" | "critical"

/** Payload shape per notification type. */
export interface NotificationPayloads {
  /** Admin audience: a new "list my turf" application awaits review. */
  "turf_application.submitted": {
    turfName: string
    contactName: string
    city?: string | null
  }
  /** Applicant: their turf was approved and is ready to claim. */
  "turf_application.approved": {
    turfName: string
    slug: string
  }
  /** Applicant: their application was rejected. */
  "turf_application.rejected": {
    turfName: string
  }
  /** Booker: payment succeeded, booking is confirmed. */
  "booking.confirmed": {
    bookingId: string
    turfName: string
    date: string
    startTime: string
  }
  /** Turf owner: a slot at their turf was just booked. */
  "booking.received": {
    bookingId: string
    turfName: string
    date: string
    startTime: string
  }
  /** The other party: a confirmed booking was cancelled. */
  "booking.cancelled": {
    bookingId: string
    turfName: string
    date: string
    startTime: string
    refundAmount?: number
  }
}

export type NotificationType = keyof NotificationPayloads

export interface NotificationTypeConfig<P> {
  priority: NotificationPriority
  audience: "player" | "turf_owner" | "admin"
  icon: ComponentType<{ className?: string }>
  title: (payload: P) => string
  body: (payload: P) => string | null
  href?: (payload: P) => string
}

type Registry = {
  [K in NotificationType]: NotificationTypeConfig<NotificationPayloads[K]>
}

export const NOTIFICATION_TYPES: Registry = {
  "turf_application.submitted": {
    priority: "info",
    audience: "admin",
    icon: InboxIcon,
    title: (p) => `New turf application: ${p.turfName}`,
    body: (p) =>
      p.city ? `${p.contactName} • ${p.city}` : `Submitted by ${p.contactName}`,
    href: () => "/admin/applications",
  },
  "turf_application.approved": {
    priority: "transactional",
    audience: "turf_owner",
    icon: MapPinIcon,
    title: (p) => `${p.turfName} is approved`,
    body: () => "Your turf is live on Turfkoi — claim it to manage bookings.",
    href: (p) => `/turfs/${p.slug}`,
  },
  "turf_application.rejected": {
    priority: "info",
    audience: "turf_owner",
    icon: CircleXIcon,
    title: (p) => `Application update: ${p.turfName}`,
    body: () => "Unfortunately we couldn't approve this application right now.",
  },
  "booking.confirmed": {
    priority: "transactional",
    audience: "player",
    icon: CalendarCheckIcon,
    title: (p) => `Booking confirmed at ${p.turfName}`,
    body: (p) => `${p.date} • ${p.startTime}`,
    href: (p) => `/bookings/${p.bookingId}`,
  },
  "booking.received": {
    priority: "transactional",
    audience: "turf_owner",
    icon: CalendarPlusIcon,
    title: (p) => `New booking at ${p.turfName}`,
    body: (p) => `${p.date} • ${p.startTime}`,
    href: () => "/turf-owner",
  },
  "booking.cancelled": {
    priority: "critical",
    audience: "player",
    icon: CalendarXIcon,
    title: (p) => `Booking cancelled at ${p.turfName}`,
    body: (p) =>
      typeof p.refundAmount === "number" && p.refundAmount > 0
        ? `${p.date} • ${p.startTime} • refund ৳${p.refundAmount}`
        : `${p.date} • ${p.startTime}`,
    href: (p) => `/bookings/${p.bookingId}`,
  },
}

export function getNotificationConfig(
  type: string
): NotificationTypeConfig<never> | undefined {
  return (NOTIFICATION_TYPES as Record<string, NotificationTypeConfig<never>>)[
    type
  ]
}
