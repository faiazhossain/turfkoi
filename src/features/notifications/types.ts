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
  UserPlusIcon,
  UserCheckIcon,
  UserXIcon,
  UsersIcon,
  MailPlusIcon,
  ClipboardListIcon,
  SwordsIcon,
  WalletIcon,
} from "lucide-react"

import { formatKickoffLabel } from "@/features/matches/authority"

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
  /** The invited player: a captain invited them to a match squad. */
  "match.invite_received": {
    matchId: string
    matchType: string
    kickoffAt?: string | null
    turfName: string
    captainName: string
    /** Over-invite: more invites out than open seats — urgency body copy. */
    contested?: boolean
  }
  /** The inviter: an invitee accepted the match invitation. */
  "match.invite_accepted": {
    matchId: string
    playerName: string
  }
  /** The inviter: an invitee declined the match invitation. */
  "match.invite_declined": {
    matchId: string
    playerName: string
  }
  /** The match captain: a player asked to join the match. */
  "match.join_requested": {
    matchId: string
    playerName: string
    turfName: string
  }
  /** The match captain: a player claimed the opponent side. */
  "match.opponent_claimed": {
    matchId: string
    playerName: string
    turfName: string
  }
  /** The home captain: a team challenged their open match. */
  "match.challenge_received": {
    matchId: string
    teamName: string
    captainName: string
    turfName: string
  }
  /** The challenge sender: the home captain accepted their team challenge. */
  "match.challenge_accepted": {
    matchId: string
    teamName: string
  }
  /** The challenge sender: the home captain declined their team challenge. */
  "match.challenge_declined": {
    matchId: string
    teamName: string
  }
  /** The addressee: someone sent them a friend request. */
  "friend.request_received": {
    friendName: string
  }
  /** The requester: their friend request was accepted. */
  "friend.request_accepted": {
    friendName: string
  }
  /** Player: a bKash wallet top-up landed. */
  "wallet.topup": {
    amount: number
    balanceAfter: number
  }
  /** Player: the ৳25 matchmaking fee was charged at a checkpoint. */
  "match.fee_charged": {
    matchId: string
    amount: number
  }
  /** Player: a fall-through match credited their fee back. */
  "match.fee_credited": {
    matchId: string
    amount: number
  }
  /** The other captain: the match was cancelled by their counterpart. */
  "match.cancelled": {
    matchId: string
  }
  /** Admin: a cash-back claim awaits review. */
  "wallet.claim_received": {
    amount: number
    userName: string
  }
  /** Player: their claim was approved — payout within 3 working days. */
  "wallet.claim_approved": {
    amount: number
  }
  /** Player: their claim was rejected — balance credited back. */
  "wallet.claim_rejected": {
    amount: number
    note?: string | null
  }
  /** Player: their claim was paid out via bKash. */
  "wallet.claim_paid": {
    amount: number
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
  "match.invite_received": {
    priority: "transactional",
    audience: "player",
    icon: MailPlusIcon,
    title: (p) => ({
      key: "notifications.matchInviteReceivedTitle",
      params: { captain: p.captainName },
    }),
    body: (p): LocalizedText | null =>
      p.kickoffAt
        ? {
            key: p.contested
              ? "notifications.matchInviteReceivedContestedBody"
              : "notifications.matchInviteReceivedBody",
            params: {
              turf: p.turfName,
              start: formatKickoffLabel(p.kickoffAt) ?? "",
            },
          }
        : null,
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.invite_accepted": {
    priority: "info",
    audience: "player",
    icon: UserCheckIcon,
    title: (p) => ({
      key: "notifications.matchInviteAcceptedTitle",
      params: { player: p.playerName },
    }),
    body: () => ({ key: "notifications.matchInviteAcceptedBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.invite_declined": {
    priority: "info",
    audience: "player",
    icon: UserXIcon,
    title: (p) => ({
      key: "notifications.matchInviteDeclinedTitle",
      params: { player: p.playerName },
    }),
    body: () => ({ key: "notifications.matchInviteDeclinedBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.join_requested": {
    priority: "info",
    audience: "player",
    icon: ClipboardListIcon,
    title: (p) => ({
      key: "notifications.matchJoinRequestedTitle",
      params: { player: p.playerName },
    }),
    body: () => ({ key: "notifications.matchJoinRequestedBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.opponent_claimed": {
    priority: "transactional",
    audience: "player",
    icon: SwordsIcon,
    title: (p) => ({
      key: "notifications.matchOpponentClaimedTitle",
      params: { player: p.playerName },
    }),
    body: (p): LocalizedText | null =>
      p.turfName
        ? {
            key: "notifications.matchOpponentClaimedBody",
            params: { turf: p.turfName },
          }
        : null,
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.challenge_received": {
    priority: "transactional",
    audience: "player",
    icon: SwordsIcon,
    title: (p) => ({
      key: "notifications.matchChallengeReceivedTitle",
      params: { team: p.teamName, captain: p.captainName },
    }),
    body: (p): LocalizedText | null =>
      p.turfName
        ? {
            key: "notifications.matchChallengeReceivedBody",
            params: { team: p.teamName, turf: p.turfName },
          }
        : null,
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.challenge_accepted": {
    priority: "transactional",
    audience: "player",
    icon: UserCheckIcon,
    title: (p) => ({
      key: "notifications.matchChallengeAcceptedTitle",
      params: { team: p.teamName },
    }),
    body: () => ({ key: "notifications.matchChallengeAcceptedBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.challenge_declined": {
    priority: "info",
    audience: "player",
    icon: UserXIcon,
    title: (p) => ({
      key: "notifications.matchChallengeDeclinedTitle",
      params: { team: p.teamName },
    }),
    body: () => ({ key: "notifications.matchChallengeDeclinedBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "friend.request_received": {
    priority: "info",
    audience: "player",
    icon: UserPlusIcon,
    title: (p) => ({
      key: "notifications.friendRequestReceivedTitle",
      params: { friend: p.friendName },
    }),
    body: () => ({ key: "notifications.friendRequestReceivedBody" }),
    href: () => "/app/friends",
  },
  "friend.request_accepted": {
    priority: "info",
    audience: "player",
    icon: UsersIcon,
    title: (p) => ({
      key: "notifications.friendRequestAcceptedTitle",
      params: { friend: p.friendName },
    }),
    body: () => ({ key: "notifications.friendRequestAcceptedBody" }),
    href: () => "/app/friends",
  },
  "wallet.topup": {
    priority: "transactional",
    audience: "player",
    icon: WalletIcon,
    title: (p) => ({
      key: "notifications.walletTopupTitle",
      params: { amount: p.amount },
    }),
    body: (p) => ({
      key: "notifications.walletTopupBody",
      params: { balance: p.balanceAfter },
    }),
    href: () => "/app/wallet",
  },
  "match.fee_charged": {
    priority: "info",
    audience: "player",
    icon: SwordsIcon,
    title: (p) => ({
      key: "notifications.matchFeeChargedTitle",
      params: { amount: p.amount },
    }),
    body: () => null,
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.fee_credited": {
    priority: "transactional",
    audience: "player",
    icon: WalletIcon,
    title: (p) => ({
      key: "notifications.matchFeeCreditedTitle",
      params: { amount: p.amount },
    }),
    body: () => ({ key: "notifications.matchFeeCreditedBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "match.cancelled": {
    priority: "critical",
    audience: "player",
    icon: SwordsIcon,
    title: () => ({ key: "notifications.matchCancelledTitle" }),
    body: () => ({ key: "notifications.matchCancelledBody" }),
    href: (p) => `/matches/${p.matchId}`,
  },
  "wallet.claim_received": {
    priority: "info",
    audience: "admin",
    icon: BanknoteIcon,
    title: (p) => ({
      key: "notifications.walletClaimReceivedTitle",
      params: { user: p.userName, amount: p.amount },
    }),
    body: () => ({ key: "notifications.walletClaimReceivedBody" }),
    href: () => "/admin/wallet-claims",
  },
  "wallet.claim_approved": {
    priority: "transactional",
    audience: "player",
    icon: WalletIcon,
    title: (p) => ({
      key: "notifications.walletClaimApprovedTitle",
      params: { amount: p.amount },
    }),
    body: () => ({ key: "notifications.walletClaimApprovedBody" }),
    href: () => "/app/wallet",
  },
  "wallet.claim_rejected": {
    priority: "transactional",
    audience: "player",
    icon: CircleXIcon,
    title: (p) => ({
      key: "notifications.walletClaimRejectedTitle",
      params: { amount: p.amount },
    }),
    body: (p): LocalizedText | null =>
      p.note
        ? { key: "notifications.walletClaimRejectedBody", params: { note: p.note } }
        : null,
    href: () => "/app/wallet",
  },
  "wallet.claim_paid": {
    priority: "transactional",
    audience: "player",
    icon: BanknoteIcon,
    title: (p) => ({
      key: "notifications.walletClaimPaidTitle",
      params: { amount: p.amount },
    }),
    body: () => null,
    href: () => "/app/wallet",
  },
}

export function getNotificationConfig(
  type: string
): NotificationTypeConfig<never> | undefined {
  return (NOTIFICATION_TYPES as Record<string, NotificationTypeConfig<never>>)[
    type
  ]
}
