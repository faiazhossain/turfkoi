import type { ComponentType } from "react"
import {
  InboxIcon,
  MapPinIcon,
  CircleXIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  ReceiptTextIcon,
  BanknoteIcon,
  BadgeCheckIcon,
  ShieldOffIcon,
} from "lucide-react"

/**
 * Notification type registry (Requirements §31) — the single source of truth
 * for how a notification renders. Payloads are typed per key; zod schemas in
 * ./schemas.ts validate them at runtime when reading rows back from the DB.
 * Keep this module pure (no server-only, no db) so client components and
 * Vitest can import it freely.
 *
 * Renderers return dictionary keys (`notifications.*`) plus interpolation
 * params instead of literal strings, so every surface can render through the
 * active locale's translator.
 */

export type NotificationPriority = "info" | "transactional" | "critical"

/** A localizable string: dictionary key + optional `{param}` values. */
export interface LocalizedText {
  key: string
  params?: Record<string, string | number>
}

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
  /** Turf owner: an admin verified their turf (SS35). */
  "turf.verified": {
    turfId: string
    turfName: string
  }
  /** Turf owner: an admin pulled their turf's verification back. */
  "turf.unverified": {
    turfId: string
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
  /** Turf owner: an ERP bill is due within 3 days. */
  "erp.bill_due": {
    name: string
    dueDate: string
  }
  /** Turf owner: staff salaries are pending this month. */
  "erp.salary_pending": {
    count: number
  }
  /** Turf owner: their premium payment was verified and granted. */
  "erp.premium_approved": {
    months: number
  }
  /** Turf owner: their premium payment claim was rejected. */
  "erp.premium_rejected": {
    reason: string
  }
}

export type NotificationType = keyof NotificationPayloads

export interface NotificationTypeConfig<P> {
  priority: NotificationPriority
  audience: "player" | "turf_owner" | "admin"
  icon: ComponentType<{ className?: string }>
  title: (payload: P) => LocalizedText
  body: (payload: P) => LocalizedText | null
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
    title: (p) => ({
      key: "notifications.turfApplicationSubmittedTitle",
      params: { turf: p.turfName },
    }),
    body: (p): LocalizedText | null =>
      p.city
        ? {
            key: "notifications.turfApplicationSubmittedBodyCity",
            params: { contact: p.contactName, city: p.city },
          }
        : {
            key: "notifications.turfApplicationSubmittedBody",
            params: { contact: p.contactName },
          },
    href: () => "/admin/applications",
  },
  "turf_application.approved": {
    priority: "transactional",
    audience: "turf_owner",
    icon: MapPinIcon,
    title: (p) => ({
      key: "notifications.turfApplicationApprovedTitle",
      params: { turf: p.turfName },
    }),
    body: () => ({ key: "notifications.turfApplicationApprovedBody" }),
    href: (p) => `/turfs/${p.slug}`,
  },
  "turf_application.rejected": {
    priority: "info",
    audience: "turf_owner",
    icon: CircleXIcon,
    title: (p) => ({
      key: "notifications.turfApplicationRejectedTitle",
      params: { turf: p.turfName },
    }),
    body: () => ({ key: "notifications.turfApplicationRejectedBody" }),
  },
  "turf.verified": {
    priority: "transactional",
    audience: "turf_owner",
    icon: BadgeCheckIcon,
    title: (p) => ({
      key: "notifications.turfVerifiedTitle",
      params: { turf: p.turfName },
    }),
    body: () => ({ key: "notifications.turfVerifiedBody" }),
    href: (p) => `/turf-owner/turfs/${p.turfId}`,
  },
  "turf.unverified": {
    priority: "transactional",
    audience: "turf_owner",
    icon: ShieldOffIcon,
    title: (p) => ({
      key: "notifications.turfUnverifiedTitle",
      params: { turf: p.turfName },
    }),
    body: () => ({ key: "notifications.turfUnverifiedBody" }),
    href: (p) => `/turf-owner/turfs/${p.turfId}`,
  },
  "booking.confirmed": {
    priority: "transactional",
    audience: "player",
    icon: CalendarCheckIcon,
    title: (p) => ({
      key: "notifications.bookingConfirmedTitle",
      params: { turf: p.turfName },
    }),
    body: (p) => ({
      key: "notifications.bookingBody",
      params: { date: p.date, start: p.startTime },
    }),
    href: (p) => `/bookings/${p.bookingId}`,
  },
  "booking.received": {
    priority: "transactional",
    audience: "turf_owner",
    icon: CalendarPlusIcon,
    title: (p) => ({
      key: "notifications.bookingReceivedTitle",
      params: { turf: p.turfName },
    }),
    body: (p) => ({
      key: "notifications.bookingBody",
      params: { date: p.date, start: p.startTime },
    }),
    href: () => "/turf-owner",
  },
  "booking.cancelled": {
    priority: "critical",
    audience: "player",
    icon: CalendarXIcon,
    title: (p) => ({
      key: "notifications.bookingCancelledTitle",
      params: { turf: p.turfName },
    }),
    body: (p): LocalizedText | null =>
      typeof p.refundAmount === "number" && p.refundAmount > 0
        ? {
            key: "notifications.bookingCancelledBodyRefund",
            params: { date: p.date, start: p.startTime, amount: p.refundAmount },
          }
        : {
            key: "notifications.bookingBody",
            params: { date: p.date, start: p.startTime },
          },
    href: (p) => `/bookings/${p.bookingId}`,
  },
  "erp.bill_due": {
    priority: "info",
    audience: "turf_owner",
    icon: ReceiptTextIcon,
    title: (p) => ({
      key: "notifications.erpBillDueTitle",
      params: { name: p.name },
    }),
    body: () => ({ key: "notifications.erpBillDueBody" }),
    href: () => "/turf-owner/erp/bills",
  },
  "erp.salary_pending": {
    priority: "info",
    audience: "turf_owner",
    icon: BanknoteIcon,
    title: (p) => ({
      key: "notifications.erpSalaryPendingTitle",
      params: { count: p.count },
    }),
    body: () => ({ key: "notifications.erpSalaryPendingBody" }),
    href: () => "/turf-owner/erp/staff/salaries",
  },
  "erp.premium_approved": {
    priority: "transactional",
    audience: "turf_owner",
    icon: BadgeCheckIcon,
    title: (p) => ({
      key: "notifications.erpPremiumApprovedTitle",
      params: { months: p.months },
    }),
    body: (p) => ({
      key: "notifications.erpPremiumApprovedBody",
      params: { months: p.months },
    }),
    href: () => "/turf-owner/erp/premium",
  },
  "erp.premium_rejected": {
    priority: "transactional",
    audience: "turf_owner",
    icon: CircleXIcon,
    title: () => ({ key: "notifications.erpPremiumRejectedTitle" }),
    body: (p): LocalizedText | null =>
      p.reason
        ? { key: "notifications.erpPremiumRejectedBody", params: { reason: p.reason } }
        : null,
    href: () => "/turf-owner/erp/premium",
  },
}

export function getNotificationConfig(
  type: string
): NotificationTypeConfig<never> | undefined {
  return (NOTIFICATION_TYPES as Record<string, NotificationTypeConfig<never>>)[
    type
  ]
}
