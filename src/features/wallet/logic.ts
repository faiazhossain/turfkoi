/**
 * Pure wallet helpers (matchmaking fee model) — DB-free so Vitest can import
 * without env wiring. Money amounts are whole Taka.
 */

/** bKash top-up bounds: small enough to be casual, large enough to matter. */
export const TOPUP_MIN_BDT = 50
export const TOPUP_MAX_BDT = 10_000

export function isTopupAmountValid(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= TOPUP_MIN_BDT &&
    amount <= TOPUP_MAX_BDT
  )
}

/**
 * Fee-credit rule: the platform keeps both fees on a completed match; every
 * fall-through state (captain cancel, expiry, never claimed) pays them back.
 * `disputed` is deliberately excluded — an admin resolves it manually.
 */
export function shouldCreditMatchFees(state: string): boolean {
  return state === "cancelled" || state === "expired"
}

/** One fee hold per (match, payer) — unique idempotency keys. */
export function homeFeeKey(matchId: string): string {
  return `fee_home_${matchId}`
}

export function awayFeeKey(matchId: string, userId: string): string {
  return `fee_away_${matchId}_${userId}`
}

/** Reversal of a fee debit — safe to re-run (same key re-credits nothing). */
export function feeBackKey(matchId: string, userId: string): string {
  return `fee_back_${matchId}_${userId}`
}

/**
 * What the user may turn into a cash claim right now. Claim requests debit
 * the balance immediately (type 'claim'), so a pending claim leaves nothing
 * claimable until it is rejected or paid.
 */
export function claimableBalance(
  balance: number,
  hasPendingClaim: boolean
): number {
  return hasPendingClaim ? 0 : Math.max(0, balance)
}
