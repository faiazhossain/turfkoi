# DeshiTurf ERP — Technical Design

Companion to `ERP_ARCHITECTURE_AUDIT.md`, `ERP_PRD.md`, `ERP_UX_SPEC.md`.
Conventions: Drizzle schema files in `src/db/schema/`, Zod v4, server actions returning
dictionary keys as errors, `can()` capabilities, numeric(12,2) money, Asia/Dhaka "today".

---

## 1. Database design

New file(s): `src/db/schema/erp.ts` (or split `erp-finance.ts` / `erp-staff.ts`).
One SQL migration `drizzle/0015_erp_foundation.sql` (dev: push, apply DDL directly if TTY prompts per project workflow).

### erp_profiles (plan + trial + settings)
```
ownerId        uuid PK → users.id (cascade)
trialStartsAt  timestamptz not null   -- backfilled = MIN(turfs.createdAt) per owner
trialEndsAt    timestamptz not null   -- trialStartsAt + 60d
plan           text not null default 'free'   -- 'free' | 'premium'
premiumUntil   timestamptz null       -- admin-granted; null = not premium
onboardedAt    timestamptz null
onboardingStep smallint default 0
settings       jsonb default '{}'     -- alert prefs, default turf scope, dismissed banners
createdAt/UpdatedAt timestamptz
```
`isPremium(owner) = plan='premium' AND premiumUntil > now()` (or within trial window).

### erp_expense_categories
```
id uuid PK, ownerId uuid → users.id, name text not null,
kind text ('fixed'|'variable'), isSystem bool default false, isActive bool default true,
createdAt;  uniq (ownerId, lower(name))
```
System categories seeded lazily per owner on first expense write (ভাড়া/rent, বিদ্যুৎ/
electricity, পানি/water, ইন্টারনেট/internet, staff salary, cleaning, maintenance, equipment,
marketing, security, অন্যান্য/other) — stored as rows so joins are uniform; labels via keys.

### erp_expenses
```
id uuid PK, ownerId uuid not null → users.id,
turfId uuid null → turfs.id (null = all turfs/business-level),
categoryId uuid → erp_expense_categories,
source text default 'manual' ('manual'|'salary'|'bill'|'rent'|'recurring')  -- provenance; salary/bill posts write rows here
sourceRefId uuid null          -- erp_salary_records.id / bill occurrence id
amount numeric(12,2) not null check (amount > 0),
date date not null,            -- business-local day, matches bookings.date semantics
vendor text, note text,
status text default 'active' ('active'|'void'),   -- never hard-delete
recurringRuleId uuid null → erp_recurring_rules,
createdBy uuid → users.id, createdAt/UpdatedAt timestamptz
idx (ownerId, date); idx (categoryId, date); idx (recurringRuleId)
```

### erp_recurring_rules
```
id uuid PK, ownerId, turfId null, categoryId, name text,
amount numeric(12,2) check (> 0),
frequency text ('monthly'|'quarterly'|'yearly'),
nextDueDate date not null, dayOfMonth smallint,
autoPost boolean default false   -- false: create reminder/alert; true: auto-post expense on due date (cron/inngest, Phase 2)
isActive bool default true, createdAt/UpdatedAt
idx (ownerId, nextDueDate) where isActive
```
Free tier enforcement: ≤3 active rules/owner (checked server-side).

### erp_other_income
```
id uuid PK, ownerId, turfId null, amount numeric(12,2) check (>0), date date,
source text (e.g. 'gate','tournament','other'), note text,
status ('active'|'void'), createdAt
idx (ownerId, date)
```
Explicitly **off-platform money only** — booking revenue is never entered here (copy + docs enforce).

### erp_staff
```
id uuid PK, ownerId not null, turfId null,
name text not null, phone text,           -- optional; masked in any listing UI
position text ('manager'|'receptionist'|'ground_staff'|'cleaner'|'security'|'maintenance'|'accountant'|'coach'|'other'),
positionOther text,                       -- when 'other'
joinedAt date, status text default 'active' ('active'|'inactive'),
salaryType text ('monthly'|'daily'|'hourly'|'commission'),
baseSalary numeric(12,2) default 0,
notes text, createdAt/UpdatedAt
idx (ownerId, status)
```
Free tier: ≤5 active staff (server-enforced).

### erp_salary_records
```
id uuid PK, ownerId not null, staffId uuid not null → erp_staff (restrict on delete),
periodMonth date not null,                -- first of month, uniq (staffId, periodMonth)
baseAmount numeric(12,2), allowance numeric(12,2) default 0,
overtime numeric(12,2) default 0, bonus numeric(12,2) default 0,
deduction numeric(12,2) default 0, advance numeric(12,2) default 0,
payable numeric(12,2) generated always as
  (baseAmount + allowance + overtime + bonus - deduction + advance) stored,
paidAmount numeric(12,2) default 0,
status text default 'pending' ('pending'|'partial'|'paid'),   -- derived: compare paid vs payable
paidAt timestamptz, method text ('cash'|'bkash'|'nagad'|'bank'), reference text, note text,
createdAt/UpdatedAt
uniq (staffId, periodMonth); idx (ownerId, periodMonth)
```
Payment validation (server): `paidAmount <= payable` unless recorded as advance; status recompute on write.

### erp_rent_contracts
```
id uuid PK, ownerId not null, turfId null,
monthlyAmount numeric(12,2) not null check (>0),
agreementStart date, agreementEnd date,
landlordName text, landlordPhone text,
securityDeposit numeric(12,2) default 0,
note text, isActive bool default true, createdAt/UpdatedAt
```
Creating a contract offers to auto-create a monthly `erp_recurring_rules` row (category=rent).

### erp_maintenance_records
```
id uuid PK, ownerId not null, turfId not null → turfs.id,
date date not null, category text ('grass'|'net'|'floodlight'|'goalpost'|'paint'|'cleaning'|'drainage'|'electrical'|'plumbing'|'equipment'|'other'),
description text, cost numeric(12,2) check (>= 0), vendor text,
status text default 'done' ('planned'|'in_progress'|'done'),
slotBlockedIds text[] null,   -- references existing turf_slots rows blocked via day panel (no new availability logic)
note text, createdAt/UpdatedAt
idx (ownerId, date)
```
Cost > 0 auto-posts an expense (source='manual' with maintenance category) — or displays as linked cost; decision: **post expense on save** to keep P&L single-source.

### erp_audit_logs (append-only)
```
id uuid PK, ownerId not null, actorId uuid not null → users.id,
entity text not null ('expense'|'salary'|'staff'|'bill_rule'|'rent'|'maintenance'|'settings'|'income'),
entityId uuid not null, action text not null ('create'|'update'|'void'|'pay'|'mark_paid'),
diff jsonb null,  -- {field: {from, to}} for updates; amounts always included
createdAt timestamptz not null default now()
idx (ownerId, entity, entityId)
```
No update/delete actions ever exposed.

### Deferred tables (created in their phase)
- Phase 3: `erp_budgets` (ownerId, month uniq, revenueTarget, expenseBudget, profitTarget) — doubles as goals.
- Phase 4: `erp_subscriptions` (billing rail), AI assistant uses no new tables.

### Migration additions
- `CREATE INDEX turfs_owner_id_idx ON turfs (owner_id);` (owner-wide booking aggregation)
- Optional: `CREATE INDEX bookings_date_idx ON bookings (date);` (period scans)
- Backfill: insert `erp_profiles` for every user with `turf_owner` role, `trialStartsAt = MIN(turfs.created_at)`, `trialEndsAt = trialStartsAt + interval '60 days'`.

## 2. Capabilities (`src/lib/capabilities.ts`)

Add following the existing pattern (admin bypass inherited; `ctx.ownerId === user.id` required for `turf_owner`):

```
erp.read            erp.update
erp.finance.read    erp.finance.update     -- income/expenses/bills/rent/maintenance
erp.staff.read      erp.staff.update       -- staff + salaries
erp.reports.read
```
Every ERP action/query: `requireUser()` → `can(user, "erp.finance.update", { ownerId: user.id })` → verify any client-supplied `turfId` belongs to `user.id` via a scoped lookup. Admins see ERP only with explicit owner context (admin views are out of MVP scope).

## 3. Server-action / query plan (`src/features/erp/`)

Structure mirroring `src/features/turfs/`: `schemas.ts` (Zod), `actions.ts`, `queries.ts`, plus `finance.ts` (aggregation math) and `insights.ts` (Phase 3).

### Mutations (all: validate → authorize → write → audit → revalidatePath)
`addExpenseAction`, `voidExpenseAction`, `addOtherIncomeAction`, `voidOtherIncomeAction`,
`upsertCategoryAction` (premium), `createRecurringRuleAction`, `updateRecurringRuleAction`,
`markBillPaidAction` (posts expense + advances nextDueDate + audit),
`upsertRentContractAction`, `addStaffAction`, `updateStaffAction`, `deactivateStaffAction`,
`upsertSalaryRecordAction`, `recordSalaryPaymentAction` (posts salary expense, updates paid/status, audit),
`addMaintenanceAction`, `updateMaintenanceStatusAction`,
`updateErpSettingsAction`, `completeOnboardingStepAction`, `adminSetPremiumAction` (admin capability).

### Aggregation queries (SQL-side, never row-fetch to client)
- `getErpOverview(ownerId, turfScope?, month)` — today/month revenue (owner share), month expenses, profit, pending obligations. Revenue SQL:
  ```sql
  select coalesce(sum(t.amount - t.platform_fee), 0)
  from bookings b join transactions t on t.booking_id = b.id
  join turfs tf on tf.id = b.turf_id
  where tf.owner_id = $1 and b.status in ('confirmed','completed')
    and b.date >= $from and b.date <= $to
  -- refunds: sum(cancellations.refund_amount) for cancelled/refunded in range → subtract
  ```
- `listExpenses(ownerId, filters, pagination)`, `listStaff`, `getSalaryMonth(ownerId, month)`, `listUpcomingBills(ownerId, days)`, `listMaintenance`.
- Phase 3: `getRevenueByDay/DayOfWeek/Hour`, `getExpenseByCategory`, `getCashFlow`, `getCustomerStats`, `getTurfComparison`, `getForecast`.

### Insights/alerts job (Phase 1: computed on overview load; Phase 2+: inngest scheduled)
- Bill due ≤3d and salary pending → `createNotifications` (reuses existing pipeline; dedupe via settings last-notified timestamps).
- Expense spike / occupancy drop (premium) computed in `insights.ts`.

## 4. Routes & components

```
src/app/(auth)/turf-owner/erp/layout.tsx     role guard (turf_owner), ensureErpProfile(),
                                             ErpSubNav + turf scope switcher + trial banner
src/app/(auth)/turf-owner/erp/page.tsx       overview
.../income|expenses|profit|staff|staff/[id]|salaries|bills|maintenance|analytics|reports|settings/page.tsx
each with loading.tsx (LoaderOverlay)
```
Components in `src/components/erp/`: `erp-sub-nav.tsx` (clone AdminSubNav), `trial-banner.tsx`,
`erp-kpi-grid.tsx`, `quick-add-expense-sheet.tsx`, `staff-card.tsx`, `salary-month-table.tsx`,
`bills-upcoming.tsx`, `profit-breakdown.tsx`, `premium-lock-card.tsx`, `turf-scope-select.tsx`,
`onboarding-sequence.tsx`, `expense-list.tsx`.

## 5. i18n keys (BN-first; both dictionaries same change, parity-tested)

Group `erp.*` nested by section. Sample tone (final copy written during implementation, BN first):

```
erp.nav.overview: "Overview" / "ওভারভিউ"
erp.nav.finance: "Finance" / "ফাইন্যান্স"
erp.overview.profitThisMonth: "This month's profit" / "এই মাসের লাভ"
erp.income.bookingRevenue: "Booking revenue" / "Booking আয়"
erp.income.otherIncome: "Other income" / "অন্য আয়"
erp.expenses.addCta: "Add expense" / "খরচ যোগ করুন"
erp.expenses.emptyBody: "…" / "আপনার ভাড়া, বিদ্যুৎ, staff salary বা অন্য খরচ যোগ করলে আমরা আপনার আসল লাভ দেখাতে পারব।"
erp.profit.breakdownNet: "Net profit" / "লাভ"
erp.profit.ownerShareHint: "…" / "Platform fee বাদে আপনার আসল আয়।"
erp.trial.active: "…" / "আপনার ERP trial চলছে — আরও {days} দিন।"
erp.premium.lockedBadge: "Premium" / "Premium"
errors.erp.staffLimitReached: "…" / "Free প্ল্যানে সর্বোচ্চ ৫ জন staff যোগ করা যায়।"
```
Enum label maps in `src/i18n/labels.ts`: `expenseCategoryLabel`, `staffPositionLabel`, `salaryStatusLabel`, `salaryMethodLabel`, `billFrequencyLabel`, `maintenanceCategoryLabel`. Action errors = keys only.

## 6. Validation rules (Zod, server-side)

Amounts: positive, ≤ 99,99,99,999, 2dp. Dates: valid ISO, not > 1 year future (expenses), salary `periodMonth` = first-of-month normalized. Bill rules: frequency + valid nextDueDate. Salary payment: `amount ≤ payable − paid` unless `isAdvance`; no payment on inactive staff. Turf scope: `turfId` ownership verified. Recurring free cap: ≤3 active rules. Staff free cap: ≤5 active. All money `numeric` strings parsed via `z.coerce.number()` then re-serialized — never float math in actions.

## 7. Testing strategy (Vitest, colocated `__tests__/`)

- **Calculation (unit):** owner-share revenue math (incl. refunds, platform-fee-cap bookings), payroll `payable`/`paid`/status derivation, recurring next-date math (month-end, leap year, yearly), profit breakdown assembly, forecast guard ("insufficient data" path).
- **Schema:** Zod schemas reject negative amounts, bad dates, over-payment without advance flag.
- **Authorization:** each action denies when `can()` fails, when `turfId` not owned, when non-owner calls; admin bypass verified.
- **Tier limits:** staff cap 5th/6th, recurring rules cap, premium-gated queries return lock state not data.
- **i18n:** parity test auto-covers new keys; label-map test extension.
- **E2E (manual script pre-MVP, Playwright later):** onboarding → add rent+electricity → add staff → pay salary → profit reflects; mobile sheet flows.

## 8. Implementation roadmap (challenged/adjusted)

**Phase 1 — Foundation (MVP)**
`erp_profiles` + trial backfill + banner; capabilities; overview dashboard with booking-revenue aggregation + owner-share math; expenses (manual + categories, void+audit); **simple recurring monthly rules (rent/electricity quick path, cap 3)** ← pulled forward from Phase 2 because onboarding step 2 requires it; other income; basic monthly profit page; onboarding sequence; notifications for due bills.

**Phase 2 — Operations**
Full payroll (allowances/deductions/advance/partial, salary history), staff cap policy live, rent contracts, full bills lifecycle (autoPost via inngest), maintenance log + slot-block deep link, audit-log UI, CSV export (premium).

**Phase 3 — Intelligence**
Cash flow, P&L any-range, analytics suite (peak hours, per-turf, YoY), customer intelligence, budgets/goals, trend alerts, premium lock UX across analytics/reports.

**Phase 4 — Premium depth**
Forecasting, DeshiTurf Business Assistant (data-grounded, cites period, never invents numbers), multi-turf consolidated reporting, PDF export, subscription billing rail.

Each phase ships behind the trial/premium gates so monetization exists from day one.

## 9. Loading-state checklist (project requirement)

Every action/button: shared `Button loading` prop; list pages: `loading.tsx` + `LoadingState` skeletons; sheets keep disable-on-pending; salary/bill mutations `router.refresh()` on success; all async states terminate on error/unmount. No new spinner designs.
