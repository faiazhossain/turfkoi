import { z } from "zod"

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "errors.invalid")
const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "errors.invalid")

// Amounts: > 0, <= 99,99,99,999.99, accepted as number | numeric string.
const money = z.coerce
  .number()
  .positive("erp.errors.amountPositive")
  .max(99_999_999.99, "erp.errors.amountTooLarge")

const optionalMoney = z.coerce
  .number()
  .min(0, "erp.errors.amountPositive")
  .max(99_999_999.99, "erp.errors.amountTooLarge")

const optionalTurfId = z.string().uuid("errors.invalid").optional().nullable()

export const addExpenseSchema = z.object({
  amount: money,
  categoryId: z.string().uuid("errors.invalid"),
  date: isoDate,
  turfId: optionalTurfId,
  vendor: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  // When set, also creates a monthly recurring rule starting next month
  // (Phase 1 quick path for rent/electricity during onboarding).
  repeatMonthly: z.boolean().optional(),
})
export type AddExpenseValues = z.infer<typeof addExpenseSchema>

export const addOtherIncomeSchema = z.object({
  amount: money,
  date: isoDate,
  turfId: optionalTurfId,
  source: z.enum(["gate", "tournament", "other"]),
  note: z.string().max(500).optional(),
})
export type AddOtherIncomeValues = z.infer<typeof addOtherIncomeSchema>

export const createRuleSchema = z.object({
  name: z.string().min(2, "errors.invalid").max(80),
  categoryId: z.string().uuid("errors.invalid"),
  amount: money,
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  nextDueDate: isoDate,
  turfId: optionalTurfId,
})
export type CreateRuleValues = z.infer<typeof createRuleSchema>

export const voidRecordSchema = z.object({ id: z.string().uuid("errors.invalid") })

export const addStaffSchema = z.object({
  name: z.string().min(2, "errors.invalid").max(80),
  phone: z.string().max(20).optional(),
  position: z.enum([
    "manager",
    "receptionist",
    "ground_staff",
    "cleaner",
    "security",
    "maintenance",
    "accountant",
    "coach",
    "other",
  ]),
  positionOther: z.string().max(60).optional(),
  salaryType: z.enum(["monthly", "daily", "hourly", "commission"]),
  baseSalary: optionalMoney.default(0),
  joinedAt: isoDate.optional(),
  turfId: optionalTurfId,
  notes: z.string().max(500).optional(),
})
export type AddStaffValues = z.infer<typeof addStaffSchema>

export const updateStaffSchema = addStaffSchema.partial()
export type UpdateStaffValues = z.infer<typeof updateStaffSchema>

export const upsertSalaryRecordSchema = z.object({
  staffId: z.string().uuid("errors.invalid"),
  periodMonth: month,
  baseAmount: optionalMoney.default(0),
  allowance: optionalMoney.default(0),
  overtime: optionalMoney.default(0),
  bonus: optionalMoney.default(0),
  deduction: optionalMoney.default(0),
  advance: optionalMoney.default(0),
})
export type UpsertSalaryRecordValues = z.infer<typeof upsertSalaryRecordSchema>

export const recordSalaryPaymentSchema = z.object({
  staffId: z.string().uuid("errors.invalid"),
  periodMonth: month,
  amount: money,
  method: z.enum(["cash", "bkash", "nagad", "bank"]),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  // Explicit overpayment/advance override (audit §31: never silently).
  isAdvance: z.boolean().optional(),
})
export type RecordSalaryPaymentValues = z.infer<typeof recordSalaryPaymentSchema>

/** `t` scoped to a single month, or the current month when omitted. */
export const monthParamSchema = month.optional()

// ---------------------------------------------------------------------------
// Phase 2: rent contracts, maintenance
// ---------------------------------------------------------------------------

export const upsertRentSchema = z.object({
  turfId: optionalTurfId,
  monthlyAmount: money,
  agreementStart: isoDate.optional(),
  agreementEnd: isoDate.optional(),
  landlordName: z.string().max(80).optional(),
  landlordPhone: z.string().max(20).optional(),
  securityDeposit: optionalMoney.default(0),
  note: z.string().max(500).optional(),
  // One-tap: also create/refresh the monthly rent recurring rule.
  createMonthlyRule: z.boolean().optional(),
})
export type UpsertRentValues = z.infer<typeof upsertRentSchema>

export const MAINTENANCE_CATEGORIES = [
  "grass",
  "net",
  "floodlight",
  "goalpost",
  "paint",
  "cleaning",
  "drainage",
  "electrical",
  "plumbing",
  "equipment",
  "other",
] as const

export const addMaintenanceSchema = z.object({
  turfId: z.string().uuid("errors.invalid"),
  date: isoDate,
  category: z.enum(MAINTENANCE_CATEGORIES),
  description: z.string().max(500).optional(),
  cost: optionalMoney.default(0),
  vendor: z.string().max(120).optional(),
  status: z.enum(["planned", "in_progress", "done"]).default("done"),
  // Purely informational: actual slot blocking happens in the day panel.
  slotBlockedNote: z.string().max(200).optional(),
})
export type AddMaintenanceValues = z.infer<typeof addMaintenanceSchema>

export const updateMaintenanceStatusSchema = z.object({
  id: z.string().uuid("errors.invalid"),
  status: z.enum(["planned", "in_progress", "done"]),
})
export type UpdateMaintenanceStatusValues = z.infer<
  typeof updateMaintenanceStatusSchema
>

// ---------------------------------------------------------------------------
// Phase 3: budgets / goals
// ---------------------------------------------------------------------------

export const upsertBudgetSchema = z.object({
  periodMonth: month,
  revenueTarget: optionalMoney.default(0),
  expenseBudget: optionalMoney.default(0),
  profitTarget: optionalMoney.default(0),
})
export type UpsertBudgetValues = z.infer<typeof upsertBudgetSchema>
