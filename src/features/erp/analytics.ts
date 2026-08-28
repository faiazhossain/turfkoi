import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  bookings,
  cancellations,
  erpBudgets,
  erpExpenses,
  erpOtherIncome,
  transactions,
  turfSlots,
  turfs,
  users,
} from "@/db/schema"
import { todayInDhaka } from "@/lib/slot-expansion"

import {
  addMonthsToMonth,
  lastMonths,
  monthRange,
  paceFraction,
  percentChange,
  requiredDailyProfit,
} from "./finance"
import {
  getBookingRevenue,
  getBookingRevenueByDay,
  getExpenseSummary,
  getOtherIncomeTotal,
  getRefunds,
} from "./queries"

const ownerShareExpr = sql<number>`COALESCE(sum(${transactions.amount} - ${transactions.platformFee}), 0)::numeric`

function revenueJoinFilters(ownerId: string, from: string, to: string) {
  return and(
    eq(turfs.ownerId, ownerId),
    eq(transactions.status, "success"),
    inArray(bookings.status, ["confirmed", "completed"]),
    gte(bookings.date, from),
    lte(bookings.date, to)
  )
}

/** Total revenue in the trailing window for each of the given months. */
export async function getRevenueTrend(ownerId: string, months: string[]) {
  if (months.length === 0) return []
  const first = monthRange(months[0]).from
  const last = monthRange(months[months.length - 1]).to
  const rows = await db
    .select({
      month: sql<string>`to_char(${bookings.date}, 'YYYY-MM')`,
      revenue: ownerShareExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .where(revenueJoinFilters(ownerId, first, last))
    .groupBy(sql`to_char(${bookings.date}, 'YYYY-MM')`)

  const byMonth = new Map(rows.map((r) => [r.month, r]))
  return months.map((m) => ({
    month: m,
    revenue: Number(byMonth.get(m)?.revenue ?? 0),
    count: byMonth.get(m)?.count ?? 0,
  }))
}

/** Total expenses for each of the given months (active rows only). */
export async function getExpenseTrend(ownerId: string, months: string[]) {
  if (months.length === 0) return []
  const first = monthRange(months[0]).from
  const last = monthRange(months[months.length - 1]).to
  const rows = await db
    .select({
      month: sql<string>`to_char(${erpExpenses.date}, 'YYYY-MM')`,
      total: sql<number>`COALESCE(sum(${erpExpenses.amount}), 0)::numeric`,
    })
    .from(erpExpenses)
    .where(
      and(
        eq(erpExpenses.ownerId, ownerId),
        eq(erpExpenses.status, "active"),
        gte(erpExpenses.date, first),
        lte(erpExpenses.date, last)
      )
    )
    .groupBy(sql`to_char(${erpExpenses.date}, 'YYYY-MM')`)

  const byMonth = new Map(rows.map((r) => [r.month, Number(r.total)]))
  return months.map((m) => ({ month: m, total: byMonth.get(m) ?? 0 }))
}

/** Revenue by weekday (0=Sun) for a range. */
export async function getRevenueByWeekday(ownerId: string, from: string, to: string) {
  const rows = await db
    .select({
      dow: sql<number>`extract(dow from ${bookings.date})::int`,
      revenue: ownerShareExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .where(revenueJoinFilters(ownerId, from, to))
    .groupBy(sql`extract(dow from ${bookings.date})`)
  return rows.map((r) => ({
    dow: Number(r.dow),
    revenue: Number(r.revenue),
    count: r.count,
  }))
}

/** Revenue by start hour (0-23), best-selling first — peak-hour intelligence. */
export async function getRevenueByHour(ownerId: string, from: string, to: string) {
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${bookings.slotStart})::int`,
      revenue: ownerShareExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .where(revenueJoinFilters(ownerId, from, to))
    .groupBy(sql`extract(hour from ${bookings.slotStart})`)
    .orderBy(desc(sql`sum(${transactions.amount} - ${transactions.platformFee})`))
  return rows.map((r) => ({
    hour: Number(r.hour),
    revenue: Number(r.revenue),
    count: r.count,
  }))
}

/** Per-turf revenue / other income / expenses / profit for a range. */
export async function getTurfComparison(ownerId: string, from: string, to: string) {
  const myTurfs = await db
    .select({ id: turfs.id, name: turfs.name })
    .from(turfs)
    .where(eq(turfs.ownerId, ownerId))
  if (myTurfs.length === 0) return []

  const revenueRows = await db
    .select({
      turfId: bookings.turfId,
      revenue: ownerShareExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .where(revenueJoinFilters(ownerId, from, to))
    .groupBy(bookings.turfId)

  const otherRows = await db
    .select({
      turfId: erpOtherIncome.turfId,
      total: sql<number>`COALESCE(sum(${erpOtherIncome.amount}), 0)::numeric`,
    })
    .from(erpOtherIncome)
    .where(
      and(
        eq(erpOtherIncome.ownerId, ownerId),
        eq(erpOtherIncome.status, "active"),
        gte(erpOtherIncome.date, from),
        lte(erpOtherIncome.date, to)
      )
    )
    .groupBy(erpOtherIncome.turfId)

  const expenseRows = await db
    .select({
      turfId: erpExpenses.turfId,
      total: sql<number>`COALESCE(sum(${erpExpenses.amount}), 0)::numeric`,
    })
    .from(erpExpenses)
    .where(
      and(
        eq(erpExpenses.ownerId, ownerId),
        eq(erpExpenses.status, "active"),
        gte(erpExpenses.date, from),
        lte(erpExpenses.date, to)
      )
    )
    .groupBy(erpExpenses.turfId)

  return myTurfs
    .map((t) => {
      const revenue = Number(revenueRows.find((r) => r.turfId === t.id)?.revenue ?? 0)
      const other = Number(otherRows.find((r) => r.turfId === t.id)?.total ?? 0)
      const expenses = Number(expenseRows.find((r) => r.turfId === t.id)?.total ?? 0)
      return {
        turfId: t.id,
        turfName: t.name,
        bookingCount: revenueRows.find((r) => r.turfId === t.id)?.count ?? 0,
        revenue,
        otherIncome: other,
        expenses,
        profit: revenue + other - expenses,
      }
    })
    .sort((a, b) => b.profit - a.profit)
}

/** Occupancy % (booked / (booked+available)) for a slot date range. */
export async function getOccupancyPct(
  ownerId: string,
  from: string,
  to: string
): Promise<number> {
  const [row] = await db
    .select({
      available: sql<number>`count(*) filter (where ${turfSlots.status} = 'available')::int`,
      booked: sql<number>`count(*) filter (where ${turfSlots.status} = 'booked')::int`,
    })
    .from(turfSlots)
    .innerJoin(turfs, eq(turfSlots.turfId, turfs.id))
    .where(
      and(eq(turfs.ownerId, ownerId), gte(turfSlots.date, from), lte(turfSlots.date, to))
    )
  const available = row?.available ?? 0
  const booked = row?.booked ?? 0
  const total = available + booked
  return total === 0 ? 0 : Math.round((booked / total) * 100)
}

export interface CustomerStats {
  totalCustomers: number
  repeatCustomers: number
  avgBookingsPerCustomer: number
  top: { bookerId: string; name: string; bookings: number; revenue: number }[]
}

/** Repeat behaviour + top customers for a range. Only display names reach the
 * client — full phone numbers never leave the server (privacy, audit §40). */
export async function getCustomerStats(
  ownerId: string,
  from: string,
  to: string
): Promise<CustomerStats> {
  const rows = await db
    .select({
      bookerId: bookings.bookerId,
      name: users.name,
      phone: users.phone,
      bookings: sql<number>`count(*)::int`,
      revenue: ownerShareExpr,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .innerJoin(users, eq(bookings.bookerId, users.id))
    .where(revenueJoinFilters(ownerId, from, to))
    .groupBy(bookings.bookerId, users.name, users.phone)

  const totalCustomers = rows.length
  const totalBookings = rows.reduce((a, r) => a + r.bookings, 0)
  return {
    totalCustomers,
    repeatCustomers: rows.filter((r) => r.bookings > 1).length,
    avgBookingsPerCustomer:
      totalCustomers === 0 ? 0 : Math.round((totalBookings / totalCustomers) * 10) / 10,
    top: rows
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((r) => ({
        bookerId: r.bookerId,
        name: r.name ?? (r.phone ? `***${r.phone.slice(-3)}` : "Player"),
        bookings: r.bookings,
        revenue: Number(r.revenue),
      })),
  }
}

/** Money in / out / net per day for a range (simple cash-flow view). */
export async function getCashFlowByDay(ownerId: string, from: string, to: string) {
  const [inDays, otherDays, expenseDays, refundRows] = await Promise.all([
    getBookingRevenueByDay(ownerId, from, to),
    db
      .select({
        date: erpOtherIncome.date,
        total: sql<number>`COALESCE(sum(${erpOtherIncome.amount}), 0)::numeric`,
      })
      .from(erpOtherIncome)
      .where(
        and(
          eq(erpOtherIncome.ownerId, ownerId),
          eq(erpOtherIncome.status, "active"),
          gte(erpOtherIncome.date, from),
          lte(erpOtherIncome.date, to)
        )
      )
      .groupBy(erpOtherIncome.date),
    db
      .select({
        date: erpExpenses.date,
        total: sql<number>`COALESCE(sum(${erpExpenses.amount}), 0)::numeric`,
      })
      .from(erpExpenses)
      .where(
        and(
          eq(erpExpenses.ownerId, ownerId),
          eq(erpExpenses.status, "active"),
          gte(erpExpenses.date, from),
          lte(erpExpenses.date, to)
        )
      )
      .groupBy(erpExpenses.date),
    db
      .select({
        date: bookings.date,
        refunds: sql<number>`COALESCE(sum(${cancellations.refundAmount}), 0)::numeric`,
      })
      .from(cancellations)
      .innerJoin(bookings, eq(cancellations.bookingId, bookings.id))
      .innerJoin(turfs, eq(bookings.turfId, turfs.id))
      .where(
        and(
          eq(turfs.ownerId, ownerId),
          sql`${cancellations.refundAmount} is not null`,
          gte(bookings.date, from),
          lte(bookings.date, to)
        )
      )
      .groupBy(bookings.date),
  ])

  const days = new Map<string, { date: string; moneyIn: number; moneyOut: number }>()
  const bucket = (date: string) => {
    let b = days.get(date)
    if (!b) {
      b = { date, moneyIn: 0, moneyOut: 0 }
      days.set(date, b)
    }
    return b
  }
  for (const d of inDays) bucket(d.date).moneyIn += Number(d.revenue)
  for (const d of otherDays) bucket(d.date).moneyIn += Number(d.total)
  for (const d of expenseDays) bucket(d.date).moneyOut += Number(d.total)
  for (const d of refundRows) bucket(d.date).moneyOut += Number(d.refunds)

  return [...days.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((b) => ({ ...b, net: b.moneyIn - b.moneyOut }))
}

export interface BudgetProgress {
  revenue: { actual: number; target: number; pct: number | null }
  expenses: { actual: number; budget: number; pct: number | null }
  profit: {
    actual: number
    target: number
    pct: number | null
    requiredDaily: number | null
  }
  pace: number
  hasBudget: boolean
}

/** Actual vs target for a month, with pacing + required-daily-remaining. */
export async function getBudgetProgress(
  ownerId: string,
  month: string,
  today: string
): Promise<BudgetProgress> {
  const { from, to } = monthRange(month)
  const [budget, revenue, expenses, other, refunds] = await Promise.all([
    db
      .select()
      .from(erpBudgets)
      .where(and(eq(erpBudgets.ownerId, ownerId), eq(erpBudgets.month, `${month}-01`)))
      .limit(1),
    getBookingRevenue(ownerId, from, to),
    getExpenseSummary(ownerId, from, to),
    getOtherIncomeTotal(ownerId, from, to),
    getRefunds(ownerId, from, to),
  ])
  const budgetRow = budget[0] ?? null
  const profitActual = revenue.revenue + other - refunds - expenses.total

  const pct = (actual: number, target: number) =>
    target <= 0 ? null : Math.min(100, Math.round((actual / target) * 100))

  const revenueActual = revenue.revenue + other
  const profitTarget = Number(budgetRow?.profitTarget ?? 0)
  return {
    revenue: {
      actual: revenueActual,
      target: Number(budgetRow?.revenueTarget ?? 0),
      pct: pct(revenueActual, Number(budgetRow?.revenueTarget ?? 0)),
    },
    expenses: {
      actual: expenses.total,
      budget: Number(budgetRow?.expenseBudget ?? 0),
      pct: pct(expenses.total, Number(budgetRow?.expenseBudget ?? 0)),
    },
    profit: {
      actual: profitActual,
      target: profitTarget,
      pct: pct(profitActual, profitTarget),
      requiredDaily: requiredDailyProfit(profitTarget, profitActual, month, today),
    },
    pace: paceFraction(month, today),
    hasBudget: budgetRow !== null,
  }
}

function addDaysISO(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Premium trend alerts: expense spike vs last month (≥15%), occupancy drop
 * vs the previous week (≥12 pts). Returns raw codes; pages translate. */
export async function getTrendAlerts(
  ownerId: string,
  month: string,
  today: string
): Promise<string[]> {
  const alerts: string[] = []
  const prev = addMonthsToMonth(month, -1)
  const [current, previous] = await Promise.all([
    getExpenseSummary(ownerId, monthRange(month).from, monthRange(month).to),
    getExpenseSummary(ownerId, monthRange(prev).from, monthRange(prev).to),
  ])
  const spike = percentChange(current.total, previous.total)
  if (spike !== null && spike >= 15) alerts.push(`expense_spike:${spike}`)

  const [thisWeek, prevWeek] = await Promise.all([
    getOccupancyPct(ownerId, today, addDaysISO(today, 6)),
    getOccupancyPct(ownerId, addDaysISO(today, -7), addDaysISO(today, -1)),
  ])
  if (prevWeek - thisWeek >= 12) alerts.push(`occupancy_drop:${prevWeek - thisWeek}`)
  return alerts
}

export async function upsertBudgetRow(
  ownerId: string,
  month: string,
  values: { revenueTarget: string; expenseBudget: string; profitTarget: string }
) {
  await db
    .insert(erpBudgets)
    .values({ ownerId, month: `${month}-01`, ...values })
    .onConflictDoUpdate({
      target: [erpBudgets.ownerId, erpBudgets.month],
      set: { ...values, updatedAt: new Date() },
    })
}

/** Guard so the module fails loudly if "today" handling drifts. */
export function erpToday(): string {
  return todayInDhaka()
}

// ---------------------------------------------------------------------------
// Phase 4: forecasting
// ---------------------------------------------------------------------------

import { forecastNext, hasSufficientHistory, type ForecastResult } from "./forecast"

export interface ErpForecast {
  sufficient: boolean
  historyMonths: string[]
  revenue: ForecastResult | null
  expenses: ForecastResult | null
  /** profit = forecast revenue − forecast expenses (null unless both exist). */
  profit: ForecastResult | null
}

/** Next-month forecast from real monthly aggregates. `sufficient: false`
 * means the UI must show the "need more data" state instead of numbers. */
export async function getForecast(ownerId: string, endMonth: string): Promise<ErpForecast> {
  const months = lastMonths(endMonth, 6)
  const [revenueTrend, expenseTrend] = await Promise.all([
    getRevenueTrend(ownerId, months),
    getExpenseTrend(ownerId, months),
  ])
  const revenue = forecastNext(
    revenueTrend.map((r) => ({ month: r.month, value: r.revenue })),
    addMonthsToMonth
  )
  const expenses = forecastNext(
    expenseTrend.map((r) => ({ month: r.month, value: r.total })),
    addMonthsToMonth
  )
  let profit: ForecastResult | null = null
  if (revenue && expenses && revenue.nextMonth === expenses.nextMonth) {
    profit = {
      nextMonth: revenue.nextMonth,
      value: Math.max(0, revenue.value - expenses.value),
      historyMonths: Math.min(revenue.historyMonths, expenses.historyMonths),
      spreadPct: Math.round((revenue.spreadPct + expenses.spreadPct) / 2),
    }
  }
  return {
    sufficient: hasSufficientHistory(revenueTrend.map((r) => ({ month: r.month, value: r.revenue }))),
    historyMonths: months,
    revenue,
    expenses,
    profit,
  }
}
