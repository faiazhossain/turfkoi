/**
 * Manual bKash Send Money intake: the platform's personal/agent bKash number
 * that users send money to before submitting a payment (TxID + receipt) for
 * admin verification. Shown on the booking payment and wallet top-up screens.
 * Empty means "not configured" — the UI falls back to support guidance.
 */
export const PLATFORM_BKASH_NUMBER =
  process.env.NEXT_PUBLIC_PLATFORM_BKASH_NUMBER ?? ""
