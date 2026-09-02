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
  "turf.verified": z.object({
    turfId: z.string(),
    turfName: z.string(),
  }),
  "turf.unverified": z.object({
    turfId: z.string(),
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
  "erp.bill_due": z.object({
    name: z.string(),
    dueDate: z.string(),
  }),
  "erp.salary_pending": z.object({
    count: z.number(),
  }),
  "erp.premium_approved": z.object({
    months: z.number(),
  }),
  "erp.premium_rejected": z.object({
    reason: z.string(),
  }),
  "match.invite_received": z.object({
    matchId: z.string(),
    matchType: z.string(),
    kickoffAt: z.string().nullish(),
    turfName: z.string(),
    captainName: z.string(),
    // True when the batch was sent to more players than there are open
    // seats — the body copy adds the accept-fast urgency line. Optional so
    // older stored rows keep parsing.
    contested: z.boolean().optional(),
  }),
  "match.invite_accepted": z.object({
    matchId: z.string(),
    playerName: z.string(),
  }),
  "match.invite_declined": z.object({
    matchId: z.string(),
    playerName: z.string(),
  }),
  "match.join_requested": z.object({
    matchId: z.string(),
    playerName: z.string(),
    turfName: z.string(),
  }),
  "match.opponent_claimed": z.object({
    matchId: z.string(),
    playerName: z.string(),
    turfName: z.string(),
  }),
  "match.challenge_received": z.object({
    matchId: z.string(),
    teamName: z.string(),
    captainName: z.string(),
    turfName: z.string(),
  }),
  "match.challenge_accepted": z.object({
    matchId: z.string(),
    teamName: z.string(),
  }),
  "match.challenge_declined": z.object({
    matchId: z.string(),
    teamName: z.string(),
  }),
  "friend.request_received": z.object({
    friendName: z.string(),
  }),
  "friend.request_accepted": z.object({
    friendName: z.string(),
  }),
  "wallet.topup": z.object({
    amount: z.number(),
    balanceAfter: z.number(),
  }),
  "match.fee_charged": z.object({
    matchId: z.string(),
    amount: z.number(),
  }),
  "match.fee_credited": z.object({
    matchId: z.string(),
    amount: z.number(),
  }),
  "match.cancelled": z.object({
    matchId: z.string(),
  }),
  "wallet.claim_received": z.object({
    amount: z.number(),
    userName: z.string(),
  }),
  "wallet.claim_approved": z.object({
    amount: z.number(),
  }),
  "wallet.claim_rejected": z.object({
    amount: z.number(),
    note: z.string().nullish(),
  }),
  "wallet.claim_paid": z.object({
    amount: z.number(),
  }),
} satisfies Record<NotificationType, z.ZodType>

export type NotificationPayloadInput = {
  [K in NotificationType]: z.input<(typeof notificationPayloadSchemas)[K]>
}[NotificationType]
