/**
 * Pure money/period math for the ERP. No db, no i18n — everything here is
 * unit-testable. Money is computed in integer paisa to avoid float drift and
 * rounded back to whole-ish Taka (2dp) at the edges, mirroring numeric(12,2).
 */

export type RuleFrequency = "monthly" | "quarterly" | "yearly"

export const SYSTEM_CATEGORY_SLUGS = [
  "rent",
  "electricity",
  "water",
  "internet",
  "staff_salary",
  "cleaning",
  "maintenance",
  "equipment",
  "marketing",
  "security",
  "other",
] as const

export type SystemCategorySlug = (typeof SYSTEM_CATEGORY_SLUGS)[number]

export const SYSTEM_CATEGORY_KIND: Record<SystemCategorySlug, "fixed" | "variable"> = {
  rent: "fixed",
  electricity: "fixed",
  water: "fixed",
  internet: "fixed",
  staff_salary: "fixed",
  cleaning: "variable",
  maintenance: "variable",
  equipment: "variable",
  marketing: "variable",
  security: "fixed",
  other: "variable",
}

const MONTH_RE = /^\d{4}-\d{2}$/

/** Round to 2 decimal places without float drift (paisa math). */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

export function toNumericString(amount: number): string {
  return roundMoney(amount).toFixed(2)
}

/** "2026-08" → { from: "2026-08-01", to: "2026-08-31" }. */
export function monthRange(month: string): { from: string; to: string } {
  if (!MONTH_RE.test(month)) throw new Error(`monthRange: invalid month ${month}`)
  const [y, m] = month.split("-").map(Number)
  if (m < 1 || m > 12) throw new Error(`monthRange: invalid month ${month}`)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` }
}

/** Month string (YYYY-MM) containing the given ISO date. */
export function monthOfDate(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function addMonthsToMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`
}

export function addMonthsToDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`
}

/** Next occurrence of a recurring rule, clamped to the month's last day. */
export function nextDueDate(dateStr: string, frequency: RuleFrequency): string {
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12
  return addMonthsToDate(dateStr, months)
}

export function daysUntil(dateStr: string, todayStr: string): number {
  const a = Date.UTC(...(dateStr.split("-").map(Number) as [number, number, number]))
  const b = Date.UTC(...(todayStr.split("-").map(Number) as [number, number, number]))
  return Math.round((a - b) / 86_400_000)
}

export interface SalaryComponents {
  baseAmount: number
  allowance: number
  overtime: number
  bonus: number
  deduction: number
  advance: number
}

/** payable = base + allowance + overtime + bonus − deduction + advance.
 * Must match the stored generated column on erp_salary_records exactly. */
export function salaryPayable(c: SalaryComponents): number {
  return roundMoney(
    c.baseAmount + c.allowance + c.overtime + c.bonus - c.deduction + c.advance
  )
}

export type SalaryStatus = "pending" | "partial" | "paid"

export function salaryStatus(payable: number, paidAmount: number): SalaryStatus {
  if (paidAmount <= 0) return "pending"
  if (paidAmount + 0.009 >= payable) return "paid"
  return "partial"
}

/** Days remaining in the trial, computed against a timestamp. */
export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000))
}

/** Weekday index (0=Sun) of an ISO date — used for the "best day" insight. */
export function weekdayOfDate(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

export interface RuleCatchUp {
  /** Each missed occurrence to post, oldest first. */
  occurrences: string[]
  /** The rule's nextDueDate after catching up. */
  nextDueDate: string
}

// ---------------------------------------------------------------------------
// Phase 3: analytics / goals math
// ---------------------------------------------------------------------------

/** MoM-style % change; null when the base is 0 (avoid divide-by-zero lies). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return roundMoney(((current - previous) / previous) * 100)
}

/** Fraction of the month elapsed at `today` (0..1). */
export function paceFraction(month: string, today: string): number {
  const { to } = monthRange(month)
  const days = Number(to.slice(8))
  const elapsed = daysUntil(today, `${month}-01`) + 1
  return Math.min(1, Math.max(0, elapsed / days))
}

/** Daily revenue still required to hit the profit target by month end. */
export function requiredDailyProfit(
  profitTarget: number,
  profitSoFar: number,
  month: string,
  today: string
): number | null {
  const { to } = monthRange(month)
  const daysLeft = daysUntil(to, today)
  if (daysLeft <= 0) return null
  const remaining = profitTarget - profitSoFar
  if (remaining <= 0) return 0
  return roundMoney(remaining / daysLeft)
}

/** Last N months, oldest first, ending with `endMonth`. */
export function lastMonths(endMonth: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonthsToMonth(endMonth, -(n - 1 - i)))
}

/** The next occurrence `steps` cycles after `from`, keeping the original
 * day-of-month (a Jan-31 rule lands on Feb-28, then Mar-31 again). */
export function nextOccurrence(
  from: string,
  frequency: RuleFrequency,
  steps = 1
): string {
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12
  const [y, m, d] = from.split("-").map(Number)
  const total = y * 12 + (m - 1) + months * steps
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`
}

/** Catch a lapsed recurring rule up to today: one occurrence per missed
 * cycle (bounded so a corrupt date can't loop forever). */
export function catchUpRule(
  rule: { nextDueDate: string; frequency: RuleFrequency },
  today: string,
  maxOccurrences = 24
): RuleCatchUp {
  const occurrences: string[] = []
  let n = 0
  let next = rule.nextDueDate
  while (occurrences.length < maxOccurrences && next <= today) {
    occurrences.push(next)
    n += 1
    next = nextOccurrence(rule.nextDueDate, rule.frequency, n)
  }
  return { occurrences, nextDueDate: next }
}
