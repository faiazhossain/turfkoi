import "server-only"

import type { turfs } from "@/db/schema"

/**
 * Per-turf-owner cancellation policy (audit MONEY FLOW MODEL, B1).
 *
 *   flexible          → full refund anytime up to cutoff (or kickoff if unset)
 *   moderate          → tiered refund by hours-to-kickoff
 *   rebook_contingent → full refund ONLY if the slot is re-booked before
 *                       kickoff; otherwise the turf keeps the payment. The
 *                       re-book check happens at settle time, so the cancel
 *                       action returns the *tentative* refund — the settle
 *                       job may claw it back.
 *   strict            → no refund
 *
 * Refunds come out of the turf owner's share — the platform fee is not
 * refunded (the platform already rendered the booking service).
 */
export interface RefundDecision {
  refundAmount: number
  /** Amount the turf owner keeps (= turfAmount - refund). */
  keepAmount: number
  /** Human-readable summary for the cancel confirmation modal. */
  summary: string
}

type Turf = Pick<typeof turfs.$inferSelect, "cancellationPolicy" | "cancellationPolicyConfig">

/**
 * @param turfAmount  the original turf-side component of what the booker paid
 *                    (= transactions.amount - transactions.platformFee, or the
 *                    slot price at booking time).
 * @param hoursToKickoff negative once kickoff has passed; treat as 0.
 * @param rebooked only consulted for rebook_contingent at settle time.
 */
export function computeRefund(
  turfAmount: number,
  turf: Turf,
  hoursToKickoff: number,
  rebooked = false
): RefundDecision {
  const maxRefund = Math.max(0, Math.round(turfAmount))
  const hours = Math.max(0, hoursToKickoff)

  switch (turf.cancellationPolicy) {
    case "strict":
      return {
        refundAmount: 0,
        keepAmount: maxRefund,
        summary: "Strict policy — no refund.",
      }

    case "rebook_contingent":
      if (rebooked) {
        return {
          refundAmount: maxRefund,
          keepAmount: 0,
          summary: "Slot was re-booked — full refund.",
        }
      }
      return {
        refundAmount: 0,
        keepAmount: maxRefund,
        summary:
          "Refund only if the slot is re-booked before kickoff. You'll be notified at kickoff.",
      }

    case "moderate": {
      const tiers = turf.cancellationPolicyConfig?.tiers ?? [
        { withinHours: 24, refundPercent: 50 },
      ]
      const largestThreshold = tiers.length
        ? Math.max(...tiers.map((t) => t.withinHours))
        : 0
      const isAboveAll = hours >= largestThreshold
      if (isAboveAll) {
        return {
          refundAmount: maxRefund,
          keepAmount: 0,
          summary: "Outside every tier — full refund of the turf amount.",
        }
      }
      // Pick the tier whose threshold the booking still meets (largest withinHours
      // that hours is >=); below the smallest threshold → no refund.
      const matched =
        tiers
          .filter((t) => hours >= t.withinHours)
          .sort((a, b) => b.withinHours - a.withinHours)[0] ?? null
      const pct = matched ? matched.refundPercent : 0
      const refund = Math.round((maxRefund * pct) / 100)
      return {
        refundAmount: refund,
        keepAmount: maxRefund - refund,
        summary:
          pct === 0
            ? "Inside the no-refund window — no refund."
            : `${pct}% of turf amount refunded (moderate policy).`,
      }
    }

    case "flexible":
    default: {
      const cutoff = turf.cancellationPolicyConfig?.cutoffHours ?? 0
      if (hours >= cutoff) {
        return {
          refundAmount: maxRefund,
          keepAmount: 0,
          summary: "Before the cutoff — full refund of the turf amount.",
        }
      }
      return {
        refundAmount: 0,
        keepAmount: maxRefund,
        summary: "Past the cancellation cutoff — no refund.",
      }
    }
  }
}
