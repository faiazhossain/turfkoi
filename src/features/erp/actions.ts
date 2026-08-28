"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  erpAuditLogs,
  erpExpenseCategories,
  erpExpenses,
  erpMaintenanceRecords,
  erpOtherIncome,
  erpRecurringRules,
  erpRentContracts,
  erpSalaryRecords,
  erpStaff,
  turfs,
} from "@/db/schema"
import { can } from "@/lib/capabilities"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"
import { z } from "zod"

import {
  addExpenseSchema,
  addOtherIncomeSchema,
  addStaffSchema,
  createRuleSchema,
  recordSalaryPaymentSchema,
  updateStaffSchema,
  upsertSalaryRecordSchema,
  upsertBudgetSchema,
  upsertRentSchema,
  addMaintenanceSchema,
  updateMaintenanceStatusSchema,
  voidRecordSchema,
  type AddExpenseValues,
  type AddMaintenanceValues,
  type AddOtherIncomeValues,
  type AddStaffValues,
  type CreateRuleValues,
  type RecordSalaryPaymentValues,
  type UpdateMaintenanceStatusValues,
  type UpdateStaffValues,
  type UpsertBudgetValues,
  type UpsertRentValues,
  type UpsertSalaryRecordValues,
} from "./schemas"
import {
  addMonthsToMonth,
  monthOfDate,
  monthRange,
  nextOccurrence,
  percentChange,
  salaryPayable,
  salaryStatus,
  toNumericString,
} from "./finance"
import {
  countActiveRules,
  getBookingRevenue,
  getExpenseSummary,
  getOtherIncomeTotal,
  getRefunds,
  getSalaryRecord,
  getStaffById,
  listCategories,
} from "./queries"
import { ensureErpProfile, getErpPlanState } from "./profile"
import { getBudgetProgress, getRevenueByHour, getRevenueByWeekday, upsertBudgetRow } from "./analytics"
import { detectIntent } from "./assistant"

export type ErpActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

const FREE_TIER_ACTIVE_RULE_LIMIT = 3
const FREE_TIER_ACTIVE_STAFF_LIMIT = 5

/** Which sub-nav surfaces depend on the mutation. */
function revalidateErp() {
  revalidatePath("/turf-owner/erp", "layout")
  revalidatePath("/turf-owner")
}

function unauthorized(): { ok: false; error: string } {
  return { ok: false, error: "errors.notSignedIn" }
}

function forbidden(): { ok: false; error: string } {
  return { ok: false, error: "errors.noPermission" }
}

function invalid(): ErpActionResult {
  return { ok: false, error: "errors.invalid" }
}

type ErpAuth =
  | { ok: true; ownerId: string; userId: string }
  | { ok: false; error: string }

type ErpReadCapability =
  | "erp.finance.read"
  | "erp.finance.update"
  | "erp.staff.read"
  | "erp.staff.update"

async function authorizeOwner(capability: ErpReadCapability): Promise<ErpAuth> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!can(user, capability, { ownerId: user.id })) return forbidden()
  return { ok: true, ownerId: user.id, userId: user.id }
}

async function audit(
  ownerId: string,
  actorId: string,
  entity: string,
  entityId: string,
  action: string,
  amount?: number
) {
  await db.insert(erpAuditLogs).values({
    ownerId,
    actorId,
    entity,
    entityId,
    action,
    amount: amount !== undefined ? toNumericString(amount) : null,
  })
}

/** Category must belong to the owner — client-supplied IDs are never trusted. */
async function categoryBelongsTo(ownerId: string, categoryId: string) {
  const [row] = await db
    .select({ id: erpExpenseCategories.id })
    .from(erpExpenseCategories)
    .where(
      and(
        eq(erpExpenseCategories.id, categoryId),
        eq(erpExpenseCategories.ownerId, ownerId)
      )
    )
    .limit(1)
  return Boolean(row)
}

async function turfBelongsTo(ownerId: string, turfId: string | null | undefined) {
  if (!turfId) return true
  const [row] = await db
    .select({ id: turfs.id })
    .from(turfs)
    .where(and(eq(turfs.id, turfId), eq(turfs.ownerId, ownerId)))
    .limit(1)
  return Boolean(row)
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function addExpenseAction(
  input: AddExpenseValues
): Promise<ErpActionResult> {
  const parsed = addExpenseSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  const { ownerId } = auth
  const user = (await getCurrentUser())!

  if (!(await categoryBelongsTo(ownerId, parsed.data.categoryId))) return forbidden()
  if (!(await turfBelongsTo(ownerId, parsed.data.turfId))) return forbidden()

  try {
    const [created] = await db
      .insert(erpExpenses)
      .values({
        ownerId,
        turfId: parsed.data.turfId ?? null,
        categoryId: parsed.data.categoryId,
        amount: toNumericString(parsed.data.amount),
        date: parsed.data.date,
        vendor: parsed.data.vendor || null,
        note: parsed.data.note || null,
        createdBy: user.id,
      })
      .returning({ id: erpExpenses.id })

    if (parsed.data.repeatMonthly) {
      const activeRules = await db
        .select({ id: erpRecurringRules.id })
        .from(erpRecurringRules)
        .where(
          and(
            eq(erpRecurringRules.ownerId, ownerId),
            eq(erpRecurringRules.isActive, true)
          )
        )
      if (activeRules.length < FREE_TIER_ACTIVE_RULE_LIMIT) {
        await db.insert(erpRecurringRules).values({
          ownerId,
          turfId: parsed.data.turfId ?? null,
          categoryId: parsed.data.categoryId,
          name: parsed.data.note?.slice(0, 80) || parsed.data.vendor || "Monthly",
          amount: toNumericString(parsed.data.amount),
          frequency: "monthly",
          nextDueDate: nextOccurrence(parsed.data.date, "monthly"),
        })
      }
    }

    await audit(ownerId, user.id, "expense", created.id, "create", parsed.data.amount)
    revalidateErp()
    return { ok: true, id: created.id }
  } catch {
    return { ok: false, error: "errors.generic" }
  }
}

export async function voidExpenseAction(id: string): Promise<ErpActionResult> {
  const parsed = voidRecordSchema.safeParse({ id })
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  const user = (await getCurrentUser())!

  const [updated] = await db
    .update(erpExpenses)
    .set({ status: "void", updatedAt: new Date() })
    .where(
      and(
        eq(erpExpenses.id, parsed.data.id),
        eq(erpExpenses.ownerId, auth.ownerId),
        eq(erpExpenses.status, "active")
      )
    )
    .returning({ id: erpExpenses.id, amount: erpExpenses.amount })
  if (!updated) return { ok: false, error: "erp.errors.notFound" }

  await audit(auth.ownerId, user.id, "expense", updated.id, "void", Number(updated.amount))
  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Other income (off-platform money only — booking revenue is never manual)
// ---------------------------------------------------------------------------

export async function addOtherIncomeAction(
  input: AddOtherIncomeValues
): Promise<ErpActionResult> {
  const parsed = addOtherIncomeSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  const user = (await getCurrentUser())!
  if (!(await turfBelongsTo(auth.ownerId, parsed.data.turfId))) return forbidden()

  try {
    const [created] = await db
      .insert(erpOtherIncome)
      .values({
        ownerId: auth.ownerId,
        turfId: parsed.data.turfId ?? null,
        amount: toNumericString(parsed.data.amount),
        date: parsed.data.date,
        source: parsed.data.source,
        note: parsed.data.note || null,
      })
      .returning({ id: erpOtherIncome.id })
    await audit(auth.ownerId, user.id, "income", created.id, "create", parsed.data.amount)
    revalidateErp()
    return { ok: true, id: created.id }
  } catch {
    return { ok: false, error: "errors.generic" }
  }
}

export async function voidOtherIncomeAction(id: string): Promise<ErpActionResult> {
  const parsed = voidRecordSchema.safeParse({ id })
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  const user = (await getCurrentUser())!

  const [updated] = await db
    .update(erpOtherIncome)
    .set({ status: "void" })
    .where(
      and(
        eq(erpOtherIncome.id, parsed.data.id),
        eq(erpOtherIncome.ownerId, auth.ownerId),
        eq(erpOtherIncome.status, "active")
      )
    )
    .returning({ id: erpOtherIncome.id, amount: erpOtherIncome.amount })
  if (!updated) return { ok: false, error: "erp.errors.notFound" }

  await audit(auth.ownerId, user.id, "income", updated.id, "void", Number(updated.amount))
  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Bills / recurring rules
// ---------------------------------------------------------------------------

export async function createRuleAction(
  input: CreateRuleValues
): Promise<ErpActionResult> {
  const parsed = createRuleSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  if (!(await categoryBelongsTo(auth.ownerId, parsed.data.categoryId))) return forbidden()
  if (!(await turfBelongsTo(auth.ownerId, parsed.data.turfId))) return forbidden()

  const active = await db
    .select({ id: erpRecurringRules.id })
    .from(erpRecurringRules)
    .where(
      and(eq(erpRecurringRules.ownerId, auth.ownerId), eq(erpRecurringRules.isActive, true))
    )
  if (active.length >= FREE_TIER_ACTIVE_RULE_LIMIT) {
    return { ok: false, error: "erp.errors.ruleLimit" }
  }

  try {
    const [created] = await db
      .insert(erpRecurringRules)
      .values({
        ownerId: auth.ownerId,
        turfId: parsed.data.turfId ?? null,
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        amount: toNumericString(parsed.data.amount),
        frequency: parsed.data.frequency,
        nextDueDate: parsed.data.nextDueDate,
      })
      .returning({ id: erpRecurringRules.id })
    await audit(auth.ownerId, (await getCurrentUser())!.id, "rule", created.id, "create", parsed.data.amount)
    revalidateErp()
    return { ok: true, id: created.id }
  } catch {
    return { ok: false, error: "errors.generic" }
  }
}

export async function deactivateRuleAction(id: string): Promise<ErpActionResult> {
  const parsed = voidRecordSchema.safeParse({ id })
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth

  const [updated] = await db
    .update(erpRecurringRules)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(erpRecurringRules.id, parsed.data.id),
        eq(erpRecurringRules.ownerId, auth.ownerId),
        eq(erpRecurringRules.isActive, true)
      )
    )
    .returning({ id: erpRecurringRules.id })
  if (!updated) return { ok: false, error: "erp.errors.notFound" }

  revalidateErp()
  return { ok: true }
}

/** One-tap "paid": posts the expense, advances the rule to its next occurrence. */
export async function markBillPaidAction(id: string): Promise<ErpActionResult> {
  const parsed = voidRecordSchema.safeParse({ id })
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  const user = (await getCurrentUser())!

  const [rule] = await db
    .select()
    .from(erpRecurringRules)
    .where(
      and(
        eq(erpRecurringRules.id, parsed.data.id),
        eq(erpRecurringRules.ownerId, auth.ownerId),
        eq(erpRecurringRules.isActive, true)
      )
    )
    .limit(1)
  if (!rule) return { ok: false, error: "erp.errors.notFound" }

  const today = todayInDhaka()
  const [expense] = await db
    .insert(erpExpenses)
    .values({
      ownerId: auth.ownerId,
      turfId: rule.turfId,
      categoryId: rule.categoryId,
      source: "bill",
      sourceRefId: rule.id,
      amount: rule.amount,
      date: today,
      note: rule.name,
      createdBy: user.id,
    })
    .returning({ id: erpExpenses.id })

  await db
    .update(erpRecurringRules)
    .set({
      nextDueDate: nextOccurrence(rule.nextDueDate, rule.frequency),
      updatedAt: new Date(),
    })
    .where(eq(erpRecurringRules.id, rule.id))

  await audit(auth.ownerId, user.id, "expense", expense.id, "create", Number(rule.amount))
  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function addStaffAction(input: AddStaffValues): Promise<ErpActionResult> {
  const parsed = addStaffSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.staff.update")
  if (!auth.ok) return auth
  if (!(await turfBelongsTo(auth.ownerId, parsed.data.turfId))) return forbidden()

  const active = await db
    .select({ id: erpStaff.id })
    .from(erpStaff)
    .where(and(eq(erpStaff.ownerId, auth.ownerId), eq(erpStaff.status, "active")))
  if (active.length >= FREE_TIER_ACTIVE_STAFF_LIMIT) {
    return { ok: false, error: "erp.errors.staffLimit" }
  }

  try {
    const { positionOther, baseSalary, ...rest } = parsed.data
    const [created] = await db
      .insert(erpStaff)
      .values({
        ...rest,
        ownerId: auth.ownerId,
        positionOther: rest.position === "other" ? (positionOther || null) : null,
        baseSalary: toNumericString(baseSalary ?? 0),
      })
      .returning({ id: erpStaff.id })
    await audit(auth.ownerId, (await getCurrentUser())!.id, "staff", created.id, "create")
    revalidateErp()
    return { ok: true, id: created.id }
  } catch {
    return { ok: false, error: "errors.generic" }
  }
}

export async function updateStaffAction(
  id: string,
  input: UpdateStaffValues
): Promise<ErpActionResult> {
  const parsed = updateStaffSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.staff.update")
  if (!auth.ok) return auth
  if (!(await turfBelongsTo(auth.ownerId, parsed.data.turfId))) return forbidden()

  const { positionOther, baseSalary, ...rest } = parsed.data
  const [updated] = await db
    .update(erpStaff)
    .set({
      ...rest,
      ...(positionOther !== undefined
        ? { positionOther: rest.position === "other" ? positionOther || null : null }
        : {}),
      ...(baseSalary !== undefined
        ? { baseSalary: toNumericString(baseSalary) }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(erpStaff.id, id), eq(erpStaff.ownerId, auth.ownerId)))
    .returning({ id: erpStaff.id })
  if (!updated) return { ok: false, error: "erp.errors.notFound" }

  revalidateErp()
  return { ok: true }
}

export async function deactivateStaffAction(id: string): Promise<ErpActionResult> {
  const parsed = voidRecordSchema.safeParse({ id })
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.staff.update")
  if (!auth.ok) return auth

  const [updated] = await db
    .update(erpStaff)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(
      and(
        eq(erpStaff.id, parsed.data.id),
        eq(erpStaff.ownerId, auth.ownerId),
        eq(erpStaff.status, "active")
      )
    )
    .returning({ id: erpStaff.id })
  if (!updated) return { ok: false, error: "erp.errors.notFound" }

  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Salaries
// ---------------------------------------------------------------------------

export async function upsertSalaryRecordAction(
  input: UpsertSalaryRecordValues
): Promise<ErpActionResult> {
  const parsed = upsertSalaryRecordSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.staff.update")
  if (!auth.ok) return auth

  const staff = await getStaffById(auth.ownerId, parsed.data.staffId)
  if (!staff) return { ok: false, error: "erp.errors.notFound" }

  const existing = await getSalaryRecord(auth.ownerId, parsed.data.staffId, parsed.data.periodMonth)
  const payable = salaryPayable({
    baseAmount: parsed.data.baseAmount,
    allowance: parsed.data.allowance,
    overtime: parsed.data.overtime,
    bonus: parsed.data.bonus,
    deduction: parsed.data.deduction,
    advance: parsed.data.advance,
  })
  const paidAmount = Number(existing?.paidAmount ?? 0)
  if (payable < paidAmount) {
    return { ok: false, error: "erp.errors.salaryOverPay" }
  }

  const periodMonth = `${parsed.data.periodMonth}-01`
  const status = salaryStatus(payable, paidAmount)

  await db
    .insert(erpSalaryRecords)
    .values({
      ownerId: auth.ownerId,
      staffId: parsed.data.staffId,
      periodMonth,
      baseAmount: toNumericString(parsed.data.baseAmount),
      allowance: toNumericString(parsed.data.allowance),
      overtime: toNumericString(parsed.data.overtime),
      bonus: toNumericString(parsed.data.bonus),
      deduction: toNumericString(parsed.data.deduction),
      advance: toNumericString(parsed.data.advance),
      paidAmount: toNumericString(paidAmount),
      status,
    })
    .onConflictDoUpdate({
      target: [erpSalaryRecords.staffId, erpSalaryRecords.periodMonth],
      set: {
        baseAmount: toNumericString(parsed.data.baseAmount),
        allowance: toNumericString(parsed.data.allowance),
        overtime: toNumericString(parsed.data.overtime),
        bonus: toNumericString(parsed.data.bonus),
        deduction: toNumericString(parsed.data.deduction),
        advance: toNumericString(parsed.data.advance),
        status,
        updatedAt: new Date(),
      },
    })

  revalidateErp()
  return { ok: true }
}

/** Records a payment and auto-posts the salary expense into Finance so P&L
 * stays single-source (UX: staff → salary → expense → profit). */
export async function recordSalaryPaymentAction(
  input: RecordSalaryPaymentValues
): Promise<ErpActionResult> {
  const parsed = recordSalaryPaymentSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.staff.update")
  if (!auth.ok) return auth
  const user = (await getCurrentUser())!

  const staff = await getStaffById(auth.ownerId, parsed.data.staffId)
  if (!staff) return { ok: false, error: "erp.errors.notFound" }

  const record = await getSalaryRecord(auth.ownerId, parsed.data.staffId, parsed.data.periodMonth)
  if (!record) return { ok: false, error: "erp.errors.salaryNoRecord" }

  const payable = Number(record.payable)
  const alreadyPaid = Number(record.paidAmount)
  const remaining = payable - alreadyPaid
  const amount = parsed.data.amount
  if (!parsed.data.isAdvance && amount > remaining + 0.009) {
    return { ok: false, error: "erp.errors.salaryOverPay" }
  }

  const newPaid = Math.round((alreadyPaid + amount) * 100) / 100
  const status = salaryStatus(payable, newPaid)

  await db
    .update(erpSalaryRecords)
    .set({
      paidAmount: toNumericString(newPaid),
      status,
      paidAt: status === "paid" ? new Date() : record.paidAt,
      method: parsed.data.method,
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      updatedAt: new Date(),
    })
    .where(eq(erpSalaryRecords.id, record.id))

  // Auto-post the payment as an expense (staff_salary system category).
  const [category] = await db
    .select({ id: erpExpenseCategories.id })
    .from(erpExpenseCategories)
    .where(
      and(
        eq(erpExpenseCategories.ownerId, auth.ownerId),
        eq(erpExpenseCategories.slug, "staff_salary")
      )
    )
    .limit(1)
  if (category) {
    const [expense] = await db
      .insert(erpExpenses)
      .values({
        ownerId: auth.ownerId,
        turfId: staff.turfId,
        categoryId: category.id,
        source: "salary",
        sourceRefId: record.id,
        amount: toNumericString(amount),
        date: todayInDhaka(),
        note: `${staff.name} · ${parsed.data.periodMonth}`,
        createdBy: user.id,
      })
      .returning({ id: erpExpenses.id })
    await audit(auth.ownerId, user.id, "expense", expense.id, "create", amount)
  }

  await audit(auth.ownerId, user.id, "salary", record.id, "pay", amount)
  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Phase 2: rent contracts, maintenance
// ---------------------------------------------------------------------------

export async function upsertRentContractAction(
  input: UpsertRentValues
): Promise<ErpActionResult> {
  const parsed = upsertRentSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth
  if (!(await turfBelongsTo(auth.ownerId, parsed.data.turfId))) return forbidden()

  // Categories must exist so the optional rent rule can reference one.
  await listCategories(auth.ownerId)

  const d = parsed.data
  await db
    .update(erpRentContracts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(erpRentContracts.ownerId, auth.ownerId),
        eq(erpRentContracts.isActive, true)
      )
    )

  const [created] = await db
    .insert(erpRentContracts)
    .values({
      ownerId: auth.ownerId,
      turfId: d.turfId ?? null,
      monthlyAmount: toNumericString(d.monthlyAmount),
      agreementStart: d.agreementStart ?? null,
      agreementEnd: d.agreementEnd ?? null,
      landlordName: d.landlordName || null,
      landlordPhone: d.landlordPhone || null,
      securityDeposit: toNumericString(d.securityDeposit ?? 0),
      note: d.note || null,
    })
    .returning({ id: erpRentContracts.id })

  if (d.createMonthlyRule) {
    const active = await countActiveRules(auth.ownerId)
    if (active < FREE_TIER_ACTIVE_RULE_LIMIT) {
      const [rentCategory] = await db
        .select({ id: erpExpenseCategories.id })
        .from(erpExpenseCategories)
        .where(
          and(
            eq(erpExpenseCategories.ownerId, auth.ownerId),
            eq(erpExpenseCategories.slug, "rent")
          )
        )
        .limit(1)
      if (rentCategory) {
        await db.insert(erpRecurringRules).values({
          ownerId: auth.ownerId,
          turfId: d.turfId ?? null,
          categoryId: rentCategory.id,
          name: d.landlordName || "Rent",
          amount: toNumericString(d.monthlyAmount),
          frequency: "monthly",
          nextDueDate: nextOccurrence(todayInDhaka(), "monthly"),
        })
      }
    }
  }

  await audit(auth.ownerId, auth.userId, "rent", created.id, "create", d.monthlyAmount)
  revalidateErp()
  return { ok: true, id: created.id }
}

export async function addMaintenanceAction(
  input: AddMaintenanceValues
): Promise<ErpActionResult> {
  const parsed = addMaintenanceSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth

  // Maintenance is always tied to a specific (owned) turf.
  const [turf] = await db
    .select({ id: turfs.id })
    .from(turfs)
    .where(and(eq(turfs.id, parsed.data.turfId), eq(turfs.ownerId, auth.ownerId)))
    .limit(1)
  if (!turf) return forbidden()

  const [created] = await db
    .insert(erpMaintenanceRecords)
    .values({
      ownerId: auth.ownerId,
      turfId: parsed.data.turfId,
      date: parsed.data.date,
      category: parsed.data.category,
      description: parsed.data.description || null,
      cost: toNumericString(parsed.data.cost ?? 0),
      vendor: parsed.data.vendor || null,
      status: parsed.data.status,
      slotBlockedNote: parsed.data.slotBlockedNote || null,
    })
    .returning({ id: erpMaintenanceRecords.id })

  // Cost > 0 auto-posts the expense so P&L stays single-source.
  if ((parsed.data.cost ?? 0) > 0) {
    await listCategories(auth.ownerId) // ensure the maintenance category exists
    const [category] = await db
      .select({ id: erpExpenseCategories.id })
      .from(erpExpenseCategories)
      .where(
        and(
          eq(erpExpenseCategories.ownerId, auth.ownerId),
          eq(erpExpenseCategories.slug, "maintenance")
        )
      )
      .limit(1)
    if (category) {
      const [expense] = await db
        .insert(erpExpenses)
        .values({
          ownerId: auth.ownerId,
          turfId: parsed.data.turfId,
          categoryId: category.id,
          source: "manual",
          sourceRefId: created.id,
          amount: toNumericString(parsed.data.cost ?? 0),
          date: parsed.data.date,
          vendor: parsed.data.vendor || null,
          note: parsed.data.description || null,
          createdBy: auth.userId,
        })
        .returning({ id: erpExpenses.id })
      await audit(auth.ownerId, auth.userId, "expense", expense.id, "create", parsed.data.cost)
    }
  }

  await audit(auth.ownerId, auth.userId, "maintenance", created.id, "create", parsed.data.cost)
  revalidateErp()
  return { ok: true, id: created.id }
}

export async function updateMaintenanceStatusAction(
  input: UpdateMaintenanceStatusValues
): Promise<ErpActionResult> {
  const parsed = updateMaintenanceStatusSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth

  const [updated] = await db
    .update(erpMaintenanceRecords)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(
      and(
        eq(erpMaintenanceRecords.id, parsed.data.id),
        eq(erpMaintenanceRecords.ownerId, auth.ownerId)
      )
    )
    .returning({ id: erpMaintenanceRecords.id })
  if (!updated) return { ok: false, error: "erp.errors.notFound" }

  await audit(auth.ownerId, auth.userId, "maintenance", updated.id, "update")
  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Phase 3: budgets / goals (premium)
// ---------------------------------------------------------------------------

export async function upsertBudgetAction(
  input: UpsertBudgetValues
): Promise<ErpActionResult> {
  const parsed = upsertBudgetSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const auth = await authorizeOwner("erp.finance.update")
  if (!auth.ok) return auth

  // Budgeting is a premium feature (trial counts as unlocked).
  const profile = await ensureErpProfile(auth.ownerId)
  if (!getErpPlanState(profile).isPremiumFeaturesUnlocked) {
    return { ok: false, error: "erp.errors.premiumRequired" }
  }

  await upsertBudgetRow(auth.ownerId, parsed.data.periodMonth, {
    revenueTarget: toNumericString(parsed.data.revenueTarget),
    expenseBudget: toNumericString(parsed.data.expenseBudget),
    profitTarget: toNumericString(parsed.data.profitTarget),
  })
  await audit(auth.ownerId, auth.userId, "settings", auth.userId, "update")
  revalidateErp()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Phase 4: Business Assistant (data-grounded, no LLM)
// ---------------------------------------------------------------------------

export const askAssistantSchema = z.object({
  question: z.string().min(2).max(300),
})

/**
 * Answers a fixed set of business questions from REAL ERP/booking data.
 * Returns a fully translated answer — the server resolves the locale, the
 * client just renders the string. Numbers always come from queries; nothing
 * is generated (PRD §34).
 */
export async function askAssistantAction(
  input: unknown
): Promise<{ ok: true; answer: string; period: string } | { ok: false; error: string }> {
  const parsed = z.object({ question: z.string().min(2).max(300) }).safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const auth = await authorizeOwner("erp.finance.read")
  if (!auth.ok) return auth

  const profile = await ensureErpProfile(auth.ownerId)
  if (!getErpPlanState(profile).isPremiumFeaturesUnlocked) {
    return { ok: false, error: "erp.errors.premiumRequired" }
  }

  const intent = detectIntent(parsed.data.question)
  if (!intent) return { ok: false, error: "erp.assistant.unknown" }

  const t = await getT()
  const today = todayInDhaka()
  const month = monthOfDate(today)
  const { from, to } = monthRange(month)

  switch (intent) {
    case "profit": {
      const [rev, other, refunds, expenses] = await Promise.all([
        getBookingRevenue(auth.ownerId, from, to),
        getOtherIncomeTotal(auth.ownerId, from, to),
        getRefunds(auth.ownerId, from, to),
        getExpenseSummary(auth.ownerId, from, to),
      ])
      const profit = rev.revenue + other - refunds - expenses.total
      return {
        ok: true,
        answer: t("erp.assistant.answerProfit", {
          profit: formatBdt(Math.round(profit)),
          revenue: formatBdt(Math.round(rev.revenue + other)),
          expenses: formatBdt(Math.round(expenses.total)),
        }),
        period: `${from} – ${to}`,
      }
    }
    case "best_day": {
      const best = await getRevenueByWeekday(auth.ownerId, from, to)
      const top = best.sort((a, b) => b.revenue - a.revenue)[0]
      if (!top) return { ok: false, error: "erp.assistant.noData" }
      return {
        ok: true,
        answer: t("erp.assistant.answerBestDay", {
          day: t(`erp.weekdays.${top.dow}`),
          amount: formatBdt(Math.round(top.revenue)),
        }),
        period: `${from} – ${to}`,
      }
    }
    case "biggest_expense": {
      const summary = await getExpenseSummary(auth.ownerId, from, to)
      const topCat = summary.byCategory[0]
      if (!topCat || summary.total === 0) return { ok: false, error: "erp.assistant.noData" }
      return {
        ok: true,
        answer: t("erp.assistant.answerBiggestExpense", {
          category: t(`erp.categories.${topCat.slug}`),
          amount: formatBdt(Math.round(topCat.total)),
          percent: Math.round((topCat.total / summary.total) * 100),
        }),
        period: `${from} – ${to}`,
      }
    }
    case "mom_comparison": {
      const prev = monthRange(addMonthsToMonth(month, -1))
      const [thisMonth, lastMonth] = await Promise.all([
        getBookingRevenue(auth.ownerId, from, to),
        getBookingRevenue(auth.ownerId, prev.from, prev.to),
      ])
      const change = percentChange(thisMonth.revenue, lastMonth.revenue)
      if (change === null) return { ok: false, error: "erp.assistant.noData" }
      return {
        ok: true,
        answer: t("erp.assistant.answerComparison", {
          direction: change >= 0 ? t("erp.assistant.up") : t("erp.assistant.down"),
          percent: Math.abs(Math.round(change)),
        }),
        period: `${prev.from} – ${to}`,
      }
    }
    case "peak_hour": {
      const hours = await getRevenueByHour(auth.ownerId, from, to)
      const top = hours[0]
      if (!top) return { ok: false, error: "erp.assistant.noData" }
      return {
        ok: true,
        answer: t("erp.assistant.answerPeakHour", {
          hour: String(top.hour).padStart(2, "0"),
          amount: formatBdt(Math.round(top.revenue)),
        }),
        period: `${from} – ${to}`,
      }
    }
    case "target_daily": {
      const progress = await getBudgetProgress(auth.ownerId, month, today)
      if (!progress.hasBudget || progress.profit.target <= 0) {
        return { ok: false, error: "erp.assistant.noTarget" }
      }
      if (progress.profit.requiredDaily === null || progress.profit.requiredDaily <= 0) {
        return { ok: true, answer: t("erp.assistant.answerTargetMet"), period: `${from} – ${to}` }
      }
      return {
        ok: true,
        answer: t("erp.assistant.answerTargetDaily", {
          amount: formatBdt(Math.round(progress.profit.requiredDaily)),
        }),
        period: `${from} – ${to}`,
      }
    }
  }
}
