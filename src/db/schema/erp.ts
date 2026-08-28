import { sql } from "drizzle-orm"
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core"

import { users } from "./users"
import { turfs } from "./turfs"

// ---------------------------------------------------------------------------
// Phase 2: rent contracts + maintenance records.
// ---------------------------------------------------------------------------

/** One active rent agreement per owner (per turf). Creating one offers an
 * auto-generated monthly recurring rule so rent never needs re-entry. */
export const erpRentContracts = pgTable(
  "erp_rent_contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turfId: uuid("turf_id").references(() => turfs.id, {
      onDelete: "set null",
    }),
    monthlyAmount: numeric("monthly_amount", { precision: 12, scale: 2 }).notNull(),
    agreementStart: date("agreement_start"),
    agreementEnd: date("agreement_end"),
    landlordName: text("landlord_name"),
    landlordPhone: text("landlord_phone"),
    securityDeposit: numeric("security_deposit", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("erp_rent_owner_idx").on(t.ownerId, t.isActive),
    check("erp_rent_amount_positive", sql`monthly_amount > 0`),
  ]
)

/** Maintenance cost ledger. Availability stays in the existing slot system —
 * `slotBlockedNote` only records that the owner blocked slots via the day
 * panel for this work. Cost > 0 auto-posts an expense on save. */
export const erpMaintenanceRecords = pgTable(
  "erp_maintenance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    category: text("category").notNull().default("other"),
    description: text("description"),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
    vendor: text("vendor"),
    status: text("status").notNull().default("done"), // planned | in_progress | done
    slotBlockedNote: text("slot_blocked_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("erp_maintenance_owner_date_idx").on(t.ownerId, t.date)]
)

// ---------------------------------------------------------------------------
// Phase 3: monthly budgets / business goals. One row per owner per month;
// targets double as goals. Progress is always computed from actuals — never
// stored.
// ---------------------------------------------------------------------------

export const erpBudgets = pgTable(
  "erp_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: date("month").notNull(), // first day of month
    revenueTarget: numeric("revenue_target", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    expenseBudget: numeric("expense_budget", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    profitTarget: numeric("profit_target", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("erp_budgets_owner_month_uniq").on(t.ownerId, t.month)]
)

// ---------------------------------------------------------------------------
// ERP (ব্যবসা) — turf-owner business management. Phase 1 foundation.
// Design docs: docs/erp/ERP_TECH_DESIGN.md. Money columns are numeric(12,2)
// like transactions; "day" columns are business-local dates (bookings.date
// semantics). Owner-entered records are voided, never deleted; every financial
// mutation writes an append-only erp_audit_logs row.
// ---------------------------------------------------------------------------

export const erpExpenseSource = pgEnum("erp_expense_source", [
  "manual",
  "salary",
  "bill",
  "recurring",
])
export const erpRecordStatus = pgEnum("erp_record_status", ["active", "void"])
export const erpRuleFrequency = pgEnum("erp_rule_frequency", [
  "monthly",
  "quarterly",
  "yearly",
])
export const erpStaffStatus = pgEnum("erp_staff_status", ["active", "inactive"])
export const erpStaffPosition = pgEnum("erp_staff_position", [
  "manager",
  "receptionist",
  "ground_staff",
  "cleaner",
  "security",
  "maintenance",
  "accountant",
  "coach",
  "other",
])
export const erpSalaryType = pgEnum("erp_salary_type", [
  "monthly",
  "daily",
  "hourly",
  "commission",
])
export const erpSalaryStatus = pgEnum("erp_salary_status", [
  "pending",
  "partial",
  "paid",
])
export const erpPaymentMethod = pgEnum("erp_payment_method", [
  "cash",
  "bkash",
  "nagad",
  "bank",
])

/** Per-owner plan/trial state. One row per turf owner, created lazily; the
 * trial is anchored to the owner's platform lifecycle (first owned turf),
 * NOT to first ERP open. */
export const erpProfiles = pgTable("erp_profiles", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  trialStartsAt: timestamp("trial_starts_at", { withTimezone: true }).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  plan: text("plan").notNull().default("free"), // 'free' | 'premium'
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

/** System categories are seeded lazily per owner so joins stay uniform;
 * labels resolve via dictionary keys (erp.categories.*). */
export const erpExpenseCategories = pgTable(
  "erp_expense_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(), // system slugs: rent, electricity, ... (custom: custom-*)
    name: text("name").notNull(),
    kind: text("kind").notNull().default("variable"), // 'fixed' | 'variable'
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("erp_categories_owner_slug_idx").on(t.ownerId, t.slug)]
)

export const erpExpenses = pgTable(
  "erp_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turfId: uuid("turf_id").references(() => turfs.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => erpExpenseCategories.id, { onDelete: "restrict" }),
    source: erpExpenseSource("source").notNull().default("manual"),
    sourceRefId: uuid("source_ref_id"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    date: date("date").notNull(),
    vendor: text("vendor"),
    note: text("note"),
    status: erpRecordStatus("status").notNull().default("active"),
    recurringRuleId: uuid("recurring_rule_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("erp_expenses_owner_date_idx").on(t.ownerId, t.date),
    index("erp_expenses_category_idx").on(t.categoryId, t.date),
  ]
)

/** Recurring obligations (rent, electricity, internet...). Free tier caps
 * active rules (checked server-side). `autoPost` arrives in Phase 2 with the
 * scheduled job — Phase 1 rules surface as upcoming bills + one-tap "paid". */
export const erpRecurringRules = pgTable(
  "erp_recurring_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turfId: uuid("turf_id").references(() => turfs.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => erpExpenseCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    frequency: erpRuleFrequency("frequency").notNull().default("monthly"),
    nextDueDate: date("next_due_date").notNull(),
    autoPost: boolean("auto_post").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("erp_rules_owner_due_idx").on(t.ownerId, t.nextDueDate),
  ]
)

/** Off-platform money only (gate money, tournament fees, cash collected
 * outside DeshiTurf). Booking revenue is NEVER entered here — it is derived
 * from bookings/transactions at query time (single source of truth). */
export const erpOtherIncome = pgTable(
  "erp_other_income",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turfId: uuid("turf_id").references(() => turfs.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    date: date("date").notNull(),
    source: text("source").notNull().default("other"), // 'gate' | 'tournament' | 'other'
    note: text("note"),
    status: erpRecordStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("erp_other_income_owner_date_idx").on(t.ownerId, t.date)]
)

export const erpStaff = pgTable(
  "erp_staff",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    turfId: uuid("turf_id").references(() => turfs.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    phone: text("phone"),
    position: erpStaffPosition("position").notNull().default("other"),
    positionOther: text("position_other"),
    joinedAt: date("joined_at"),
    status: erpStaffStatus("status").notNull().default("active"),
    salaryType: erpSalaryType("salary_type").notNull().default("monthly"),
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("erp_staff_owner_status_idx").on(t.ownerId, t.status)]
)

/** One record per staff per month. `payable` is a stored generated column;
 * status is derived (pending/partial/paid) from paidAmount vs payable. */
export const erpSalaryRecords = pgTable(
  "erp_salary_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => erpStaff.id, { onDelete: "cascade" }),
    periodMonth: date("period_month").notNull(), // first day of month
    baseAmount: numeric("base_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    allowance: numeric("allowance", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    overtime: numeric("overtime", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    bonus: numeric("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    deduction: numeric("deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    advance: numeric("advance", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    payable: numeric("payable", { precision: 12, scale: 2 })
      .notNull()
      .generatedAlwaysAs(
        sql`base_amount + allowance + overtime + bonus - deduction + advance`
      ),
    paidAmount: numeric("paid_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: erpSalaryStatus("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    method: erpPaymentMethod("method"),
    reference: text("reference"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("erp_salary_staff_month_idx").on(t.staffId, t.periodMonth),
    index("erp_salary_owner_month_idx").on(t.ownerId, t.periodMonth),
  ]
)

/** Append-only audit trail for financial mutations. No update/delete paths
 * exist by design. */
export const erpAuditLogs = pgTable(
  "erp_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    entity: text("entity").notNull(), // 'expense' | 'income' | 'salary' | 'staff' | 'rule' | 'settings'
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // 'create' | 'void' | 'pay' | 'update'
    amount: numeric("amount", { precision: 12, scale: 2 }),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("erp_audit_owner_entity_idx").on(t.ownerId, t.entity, t.entityId)]
)
