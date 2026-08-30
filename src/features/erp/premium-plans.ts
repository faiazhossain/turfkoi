/**
 * ERP Premium plans + manual MFS payment details (single source of truth).
 *
 * PRICES AND MERCHANT NUMBERS: the business owner edits these constants —
 * they are intentionally NOT env vars so the product copies stay in sync.
 * Replace the placeholder numbers with the real DeshiTurf bKash/Nagad/Rocket
 * merchant numbers before launch.
 */

export interface ErpPremiumPlan {
  months: 1 | 3 | 12
  amountBdt: number
}

export const ERP_PREMIUM_PLANS: ErpPremiumPlan[] = [
  { months: 1, amountBdt: 500 },
  { months: 3, amountBdt: 1200 },
  { months: 12, amountBdt: 4000 },
]

export const ERP_MFS_ACCOUNTS: Record<"bkash" | "nagad" | "rocket", string> = {
  bkash: "01785872142",
  nagad: "01785872142",
  rocket: "01785872142",
}

export const ERP_MFS_ACCOUNT_TYPES: Record<"bkash" | "nagad" | "rocket", string> = {
  bkash: "Personal",
  nagad: "Personal",
  rocket: "Personal",
}

export function planForMonths(months: number): ErpPremiumPlan | null {
  return ERP_PREMIUM_PLANS.find((p) => p.months === months) ?? null
}

/**
 * Pure premium-extension math: extending an active subscription adds months
 * on top of the existing expiry; an expired/new subscription starts now.
 * `notBefore` (e.g. an ongoing trial's end) pushes the start later so paid
 * months never run concurrently with free access.
 * Used by admin grant and payment approval — both must agree.
 */
export function nextPremiumUntil(
  currentUntil: Date | null,
  months: number,
  now: Date,
  notBefore?: Date | null
): Date {
  let base = now
  for (const candidate of [currentUntil, notBefore]) {
    if (candidate && candidate > base) base = candidate
  }
  return new Date(base.getTime() + months * 30 * 86_400_000)
}
