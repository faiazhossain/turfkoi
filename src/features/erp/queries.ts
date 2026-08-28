import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  bookings,
  cancellations,
  erpAuditLogs,
  erpExpenseCategories,
  erpExpenses,
  erpMaintenanceRecords,
  erpOtherIncome,
  erpRecurringRules,
  erpRentContracts,
  erpSalaryRecords,
  erpStaff,
  transactions,
  turfs,
} from "@/db/schema"
import { todayInDhaka } from "@/lib/slot-expansion"
import { getOwnerKPIs } from "@/features/turfs/queries"

import {
  SYSTEM_CATEGORY_KIND,
  SYSTEM_CATEGORY_SLUGS,
  daysUntil,
  monthRange,
  salaryPayable,
  salaryStatus,
} from "./finance"
import { ensureErpProfile, getErpPlanState } from "./profile"

// ---------------------------------------------------------------------------
// Category helpers
// ---------------------------------------------------------------------------

export type ErpCategory = typeof erpExpenseCategories.$inferSelect

/** Lazily seed the system categories for an owner, then list all active. */
export async function listCategories(ownerId: string): Promise<ErpCategory[]> {
  await db
    .insert(erpExpenseCategories)
    .values(
      SYSTEM_CATEGORY_SLUGS.map((slug) => ({
        ownerId,
        slug,
        name: slug,
        kind: SYSTEM_CATEGORY_KIND[slug],
        isSystem: true,
      }))
    )
    .onConflictDoNothing()
  return db
    .select()
    .from(erpExpenseCategories)
    .where(
      and(eq(erpExpenseCategories.ownerId, ownerId), eq(erpExpenseCategories.isActive, true))
    )
    .orderBy(desc(erpExpenseCategories.isSystem), asc(erpExpenseCategories.name))
}

// ---------------------------------------------------------------------------
// Revenue (single source of truth: bookings + transactions)
// ---------------------------------------------------------------------------

/** Owner-share booking revenue: successful transaction minus the immutable
 * platform fee, for confirmed/completed bookings in the date range. */
export async function getBookingRevenue(
  ownerId: string,
  from: string,
  to: string
): Promise<{ revenue: number; bookingCount: number }> {
  const [row] = await db
    .select({
      revenue: sql<number>`COALESCE(sum(${transactions.amount} - ${transactions.platformFee}), 0)::numeric`,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .where(
      and(
        eq(turfs.ownerId, ownerId),
        eq(transactions.status, "success"),
        inArray(bookings.status, ["confirmed", "completed"]),
        gte(bookings.date, from),
        lte(bookings.date, to)
      )
    )
  return { revenue: Number(row?.revenue ?? 0), bookingCount: row?.count ?? 0 }
}

/** Refunds returned to bookers (owner's share pays them — the platform fee is
 * never refunded). Shown as a deduction line, never hidden inside revenue. */
export async function getRefunds(
  ownerId: string,
  from: string,
  to: string
): Promise<number> {
  const [row] = await db
    .select({
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
  return Number(row?.refunds ?? 0)
}

export async function getBookingRevenueByDay(ownerId: string, from: string, to: string) {
  return db
    .select({
      date: bookings.date,
      revenue: sql<number>`COALESCE(sum(${transactions.amount} - ${transactions.platformFee}), 0)::numeric`,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
    .innerJoin(turfs, eq(bookings.turfId, turfs.id))
    .where(
      and(
        eq(turfs.ownerId, ownerId),
        eq(transactions.status, "success"),
        inArray(bookings.status, ["confirmed", "completed"]),
        gte(bookings.date, from),
        lte(bookings.date, to)
      )
    )
    .groupBy(bookings.date)
    .orderBy(asc(bookings.date))
}

// ---------------------------------------------------------------------------
// Expenses & other income
// ---------------------------------------------------------------------------

export interface CategoryTotal {
  categoryId: string
  slug: string
  name: string
  kind: string
  total: number
}

export async function getExpenseSummary(
  ownerId: string,
  from: string,
  to: string
): Promise<{ total: number; byCategory: CategoryTotal[] }> {
  const rows = await db
    .select({
      categoryId: erpExpenseCategories.id,
      slug: erpExpenseCategories.slug,
      name: erpExpenseCategories.name,
      kind: erpExpenseCategories.kind,
      total: sql<number>`COALESCE(sum(${erpExpenses.amount}), 0)::numeric`,
    })
    .from(erpExpenses)
    .innerJoin(erpExpenseCategories, eq(erpExpenses.categoryId, erpExpenseCategories.id))
    .where(
      and(
        eq(erpExpenses.ownerId, ownerId),
        eq(erpExpenses.status, "active"),
        gte(erpExpenses.date, from),
        lte(erpExpenses.date, to)
      )
    )
    .groupBy(
      erpExpenseCategories.id,
      erpExpenseCategories.slug,
      erpExpenseCategories.name,
      erpExpenseCategories.kind
    )
    .orderBy(desc(sql`sum(${erpExpenses.amount})`))

  return {
    total: rows.reduce((acc, r) => acc + Number(r.total), 0),
    byCategory: rows.map((r) => ({ ...r, total: Number(r.total) })),
  }
}

export async function getOtherIncomeTotal(
  ownerId: string,
  from: string,
  to: string
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(sum(${erpOtherIncome.amount}), 0)::numeric` })
    .from(erpOtherIncome)
    .where(
      and(
        eq(erpOtherIncome.ownerId, ownerId),
        eq(erpOtherIncome.status, "active"),
        gte(erpOtherIncome.date, from),
        lte(erpOtherIncome.date, to)
      )
    )
  return Number(row?.total ?? 0)
}

export async function listExpenses(ownerId: string, from: string, to: string, limit = 100) {
  return db
    .select({
      id: erpExpenses.id,
      amount: erpExpenses.amount,
      date: erpExpenses.date,
      vendor: erpExpenses.vendor,
      note: erpExpenses.note,
      source: erpExpenses.source,
      categorySlug: erpExpenseCategories.slug,
      categoryName: erpExpenseCategories.name,
    })
    .from(erpExpenses)
    .innerJoin(erpExpenseCategories, eq(erpExpenses.categoryId, erpExpenseCategories.id))
    .where(
      and(
        eq(erpExpenses.ownerId, ownerId),
        eq(erpExpenses.status, "active"),
        gte(erpExpenses.date, from),
        lte(erpExpenses.date, to)
      )
    )
    .orderBy(desc(erpExpenses.date), desc(erpExpenses.createdAt))
    .limit(limit)
}

export async function listOtherIncome(ownerId: string, from: string, to: string, limit = 50) {
  return db
    .select()
    .from(erpOtherIncome)
    .where(
      and(
        eq(erpOtherIncome.ownerId, ownerId),
        eq(erpOtherIncome.status, "active"),
        gte(erpOtherIncome.date, from),
        lte(erpOtherIncome.date, to)
      )
    )
    .orderBy(desc(erpOtherIncome.date), desc(erpOtherIncome.createdAt))
    .limit(limit)
}

// ---------------------------------------------------------------------------
// Bills / recurring rules
// ---------------------------------------------------------------------------

export async function listRules(ownerId: string) {
  const rows = await db
    .select({
      id: erpRecurringRules.id,
      name: erpRecurringRules.name,
      amount: erpRecurringRules.amount,
      frequency: erpRecurringRules.frequency,
      nextDueDate: erpRecurringRules.nextDueDate,
      isActive: erpRecurringRules.isActive,
      categorySlug: erpExpenseCategories.slug,
      categoryName: erpExpenseCategories.name,
    })
    .from(erpRecurringRules)
    .innerJoin(erpExpenseCategories, eq(erpRecurringRules.categoryId, erpExpenseCategories.id))
    .where(eq(erpRecurringRules.ownerId, ownerId))
    .orderBy(asc(erpRecurringRules.nextDueDate))

  const today = todayInDhaka()
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    daysUntilDue: r.isActive ? daysUntil(r.nextDueDate, today) : null,
  }))
}

export async function countActiveRules(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(erpRecurringRules)
    .where(
      and(eq(erpRecurringRules.ownerId, ownerId), eq(erpRecurringRules.isActive, true))
    )
  return row?.count ?? 0
}

// ---------------------------------------------------------------------------
// Staff & salaries
// ---------------------------------------------------------------------------

export async function listStaff(ownerId: string) {
  return db
    .select()
    .from(erpStaff)
    .where(eq(erpStaff.ownerId, ownerId))
    .orderBy(desc(erpStaff.status), asc(erpStaff.name))
}

export async function countActiveStaff(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(erpStaff)
    .where(and(eq(erpStaff.ownerId, ownerId), eq(erpStaff.status, "active")))
  return row?.count ?? 0
}

export interface SalaryMonthRow {
  staffId: string
  staffName: string
  baseSalary: number
  salaryType: string
  recordId: string | null
  components: {
    baseAmount: number
    allowance: number
    overtime: number
    bonus: number
    deduction: number
    advance: number
  }
  payable: number
  paidAmount: number
  status: "pending" | "partial" | "paid"
  method: string | null
}

/** Staff × their salary record for one month (left join → pending rows appear). */
export async function getSalaryMonth(
  ownerId: string,
  month: string
): Promise<SalaryMonthRow[]> {
  const rows = await db
    .select({
      staffId: erpStaff.id,
      staffName: erpStaff.name,
      baseSalary: erpStaff.baseSalary,
      salaryType: erpStaff.salaryType,
      recordId: erpSalaryRecords.id,
      baseAmount: erpSalaryRecords.baseAmount,
      allowance: erpSalaryRecords.allowance,
      overtime: erpSalaryRecords.overtime,
      bonus: erpSalaryRecords.bonus,
      deduction: erpSalaryRecords.deduction,
      advance: erpSalaryRecords.advance,
      payable: erpSalaryRecords.payable,
      paidAmount: erpSalaryRecords.paidAmount,
      status: erpSalaryRecords.status,
      method: erpSalaryRecords.method,
    })
    .from(erpStaff)
    .leftJoin(
      erpSalaryRecords,
      and(
        eq(erpSalaryRecords.staffId, erpStaff.id),
        eq(erpSalaryRecords.periodMonth, `${month}-01`)
      )
    )
    .where(and(eq(erpStaff.ownerId, ownerId), eq(erpStaff.status, "active")))
    .orderBy(asc(erpStaff.name))

  return rows.map((r) => {
    const components = {
      baseAmount: Number(r.baseAmount ?? r.baseSalary ?? 0),
      allowance: Number(r.allowance ?? 0),
      overtime: Number(r.overtime ?? 0),
      bonus: Number(r.bonus ?? 0),
      deduction: Number(r.deduction ?? 0),
      advance: Number(r.advance ?? 0),
    }
    const payable = r.payable !== null ? Number(r.payable) : salaryPayable(components)
    const paidAmount = Number(r.paidAmount ?? 0)
    return {
      staffId: r.staffId,
      staffName: r.staffName,
      baseSalary: Number(r.baseSalary ?? 0),
      salaryType: r.salaryType,
      recordId: r.recordId,
      components,
      payable,
      paidAmount,
      status: salaryStatus(payable, paidAmount),
      method: r.method ?? null,
    }
  })
}

export async function getStaffById(ownerId: string, staffId: string) {
  const [row] = await db
    .select()
    .from(erpStaff)
    .where(and(eq(erpStaff.id, staffId), eq(erpStaff.ownerId, ownerId)))
    .limit(1)
  return row ?? null
}

export async function getSalaryRecord(ownerId: string, staffId: string, month: string) {
  const [row] = await db
    .select()
    .from(erpSalaryRecords)
    .where(
      and(
        eq(erpSalaryRecords.ownerId, ownerId),
        eq(erpSalaryRecords.staffId, staffId),
        eq(erpSalaryRecords.periodMonth, `${month}-01`)
      )
    )
    .limit(1)
  return row ?? null
}

// ---------------------------------------------------------------------------
// Overview (business command center)
// ---------------------------------------------------------------------------

export interface ErpOverview {
  plan: ReturnType<typeof getErpPlanState>
  todayRevenue: number
  month: {
    bookingRevenue: number
    bookingCount: number
    otherIncome: number
    refunds: number
    expenses: number
    profit: number
  }
  occupancyPct: number
  activeStaff: number
  pendingSalaryTotal: number
  pendingSalaryCount: number
  upcomingBills: { id: string; name: string; amount: number; nextDueDate: string; daysUntilDue: number }[]
  bestWeekday: number | null
  onboarding: { hasExpense: boolean; hasStaff: boolean; hasRule: boolean }
}

export async function getErpOverview(ownerId: string, month: string): Promise<ErpOverview> {
  const today = todayInDhaka()
  const { from, to } = monthRange(month)

  const [
    profile,
    todayRev,
    monthRev,
    otherIncome,
    refunds,
    expenses,
    kpis,
    staffCount,
    salaryRows,
    rules,
    bestDay,
    hasExpense,
    hasStaff,
    hasRule,
  ] = await Promise.all([
    ensureErpProfile(ownerId),
    getBookingRevenue(ownerId, today, today),
    getBookingRevenue(ownerId, from, to),
    getOtherIncomeTotal(ownerId, from, to),
    getRefunds(ownerId, from, to),
    getExpenseSummary(ownerId, from, to),
    getOwnerKPIs(ownerId),
    countActiveStaff(ownerId),
    getSalaryMonth(ownerId, month),
    listRules(ownerId),
    db
      .select({
        dow: sql<number>`extract(dow from ${bookings.date})::int`,
        revenue: sql<number>`COALESCE(sum(${transactions.amount} - ${transactions.platformFee}), 0)::numeric`,
      })
      .from(bookings)
      .innerJoin(transactions, eq(transactions.bookingId, bookings.id))
      .innerJoin(turfs, eq(bookings.turfId, turfs.id))
      .where(
        and(
          eq(turfs.ownerId, ownerId),
          eq(transactions.status, "success"),
          inArray(bookings.status, ["confirmed", "completed"]),
          gte(bookings.date, from),
          lte(bookings.date, to)
        )
      )
      .groupBy(sql`extract(dow from ${bookings.date})`)
      .orderBy(desc(sql`sum(${transactions.amount} - ${transactions.platformFee})`))
      .limit(1),
    db
      .select({ id: erpExpenses.id })
      .from(erpExpenses)
      .where(and(eq(erpExpenses.ownerId, ownerId), eq(erpExpenses.status, "active")))
      .limit(1),
    db
      .select({ id: erpStaff.id })
      .from(erpStaff)
      .where(and(eq(erpStaff.ownerId, ownerId), eq(erpStaff.status, "active")))
      .limit(1),
    db
      .select({ id: erpRecurringRules.id })
      .from(erpRecurringRules)
      .where(
        and(eq(erpRecurringRules.ownerId, ownerId), eq(erpRecurringRules.isActive, true))
      )
      .limit(1),
  ])

  const monthBookingRevenue = monthRev.revenue
  const monthProfit =
    monthBookingRevenue + otherIncome - refunds - expenses.total

  const pending = salaryRows.filter((r) => r.status !== "paid")
  const pendingSalaryTotal = pending.reduce(
    (acc, r) => acc + Math.max(0, r.payable - r.paidAmount),
    0
  )

  return {
    plan: getErpPlanState(profile),
    todayRevenue: todayRev.revenue,
    month: {
      bookingRevenue: monthBookingRevenue,
      bookingCount: monthRev.bookingCount,
      otherIncome,
      refunds,
      expenses: expenses.total,
      profit: monthProfit,
    },
    occupancyPct: kpis.occupancyPct,
    activeStaff: staffCount,
    pendingSalaryTotal,
    pendingSalaryCount: pending.length,
    upcomingBills: rules
      .filter((r) => r.isActive && r.daysUntilDue !== null && r.daysUntilDue <= 30)
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        name: r.name,
        amount: r.amount,
        nextDueDate: r.nextDueDate,
        daysUntilDue: r.daysUntilDue ?? 0,
      })),
    bestWeekday: bestDay[0] ? Number(bestDay[0].dow) : null,
    onboarding: {
      hasExpense: hasExpense.length > 0,
      hasStaff: hasStaff.length > 0,
      hasRule: hasRule.length > 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Phase 2: rent contracts, maintenance, audit
// ---------------------------------------------------------------------------

export async function getRentContract(ownerId: string) {
  const [row] = await db
    .select()
    .from(erpRentContracts)
    .where(
      and(eq(erpRentContracts.ownerId, ownerId), eq(erpRentContracts.isActive, true))
    )
    .orderBy(desc(erpRentContracts.createdAt))
    .limit(1)
  return row ?? null
}

export async function listMaintenance(ownerId: string, limit = 100) {
  return db
    .select({
      id: erpMaintenanceRecords.id,
      date: erpMaintenanceRecords.date,
      category: erpMaintenanceRecords.category,
      description: erpMaintenanceRecords.description,
      cost: erpMaintenanceRecords.cost,
      vendor: erpMaintenanceRecords.vendor,
      status: erpMaintenanceRecords.status,
      turfId: erpMaintenanceRecords.turfId,
      turfName: turfs.name,
    })
    .from(erpMaintenanceRecords)
    .innerJoin(turfs, eq(erpMaintenanceRecords.turfId, turfs.id))
    .where(eq(erpMaintenanceRecords.ownerId, ownerId))
    .orderBy(desc(erpMaintenanceRecords.date), desc(erpMaintenanceRecords.createdAt))
    .limit(limit)
}

export async function listAuditLogs(ownerId: string, limit = 30) {
  return db
    .select({
      id: erpAuditLogs.id,
      entity: erpAuditLogs.entity,
      entityId: erpAuditLogs.entityId,
      action: erpAuditLogs.action,
      amount: erpAuditLogs.amount,
      createdAt: erpAuditLogs.createdAt,
    })
    .from(erpAuditLogs)
    .where(eq(erpAuditLogs.ownerId, ownerId))
    .orderBy(desc(erpAuditLogs.createdAt))
    .limit(limit)
}

/** Recent salary records for one staff member (payroll history page). */
export async function getSalaryHistory(ownerId: string, staffId: string, limit = 12) {
  return db
    .select({
      id: erpSalaryRecords.id,
      periodMonth: erpSalaryRecords.periodMonth,
      payable: erpSalaryRecords.payable,
      paidAmount: erpSalaryRecords.paidAmount,
      status: erpSalaryRecords.status,
      method: erpSalaryRecords.method,
      paidAt: erpSalaryRecords.paidAt,
    })
    .from(erpSalaryRecords)
    .where(
      and(eq(erpSalaryRecords.ownerId, ownerId), eq(erpSalaryRecords.staffId, staffId))
    )
    .orderBy(desc(erpSalaryRecords.periodMonth))
    .limit(limit)
}
