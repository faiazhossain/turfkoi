/**
 * Fee model (audit MONEY FLOW MODEL): booker pays turf price + a ~5%
 * platform fee, capped at ৳100. The turf amount is what the owner eventually
 * receives via weekly payout; the fee is what the platform keeps.
 *
 * Single source of truth — used by the booking checkout UI, the payment
 * initiation action, and the payout aggregation. Keep this pure.
 */
export const PLATFORM_FEE_PERCENT = 0.05
export const PLATFORM_FEE_CAP_BDT = 100

/**
 * Matchmaking fee: ৳25 per team per match (both sides pay — the platform
 * earns ৳50 per completed match). Collected wallet-first at the match
 * checkpoints; credited back when a match falls through (see
 * features/wallet). Pure constant — keep this file pure.
 */
export const MATCH_FEE_BDT = 25

export interface FeeBreakdown {
  /** What the turf owner will be paid out (net of platform fee). */
  turfAmount: number
  /** Platform fee in BDT, already capped. */
  platformFee: number
  /** What the booker pays upfront. */
  total: number
}

export function computeFees(slotPrice: number): FeeBreakdown {
  if (!Number.isFinite(slotPrice) || slotPrice < 0) {
    throw new Error(`computeFees: invalid slotPrice ${slotPrice}`)
  }
  const rawFee = slotPrice * PLATFORM_FEE_PERCENT
  const platformFee = Math.min(rawFee, PLATFORM_FEE_CAP_BDT)
  // Round to whole Taka — bKash doesn't deal in paisa for these flows.
  const turfAmount = Math.round(slotPrice)
  const total = turfAmount + Math.round(platformFee)
  return { turfAmount, platformFee: Math.round(platformFee), total }
}

export function formatBdt(n: number): string {
  return `৳${Number(n).toLocaleString("en-BD")}`
}
