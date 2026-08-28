-- 0015: ERP (ব্যবসা) Phase 1 foundation.
-- Design: docs/erp/ERP_TECH_DESIGN.md §1. Money = numeric(12,2); day columns
-- are business-local dates (bookings.date semantics). Financial records are
-- voided, never deleted. Trial anchored to owner platform lifecycle.

CREATE TYPE "erp_expense_source" AS ENUM ('manual', 'salary', 'bill', 'recurring');
CREATE TYPE "erp_record_status" AS ENUM ('active', 'void');
CREATE TYPE "erp_rule_frequency" AS ENUM ('monthly', 'quarterly', 'yearly');
CREATE TYPE "erp_staff_status" AS ENUM ('active', 'inactive');
CREATE TYPE "erp_staff_position" AS ENUM ('manager', 'receptionist', 'ground_staff', 'cleaner', 'security', 'maintenance', 'accountant', 'coach', 'other');
CREATE TYPE "erp_salary_type" AS ENUM ('monthly', 'daily', 'hourly', 'commission');
CREATE TYPE "erp_salary_status" AS ENUM ('pending', 'partial', 'paid');
CREATE TYPE "erp_payment_method" AS ENUM ('cash', 'bkash', 'nagad', 'bank');

CREATE TABLE "erp_profiles" (
  "owner_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "trial_starts_at" timestamp with time zone NOT NULL,
  "trial_ends_at" timestamp with time zone NOT NULL,
  "plan" text NOT NULL DEFAULT 'free',
  "premium_until" timestamp with time zone,
  "onboarded_at" timestamp with time zone,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "erp_expense_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'variable',
  "is_system" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "erp_categories_owner_slug_idx" ON "erp_expense_categories" ("owner_id", "slug");

CREATE TABLE "erp_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turf_id" uuid REFERENCES "turfs"("id") ON DELETE SET NULL,
  "category_id" uuid NOT NULL REFERENCES "erp_expense_categories"("id") ON DELETE RESTRICT,
  "source" "erp_expense_source" NOT NULL DEFAULT 'manual',
  "source_ref_id" uuid,
  "amount" numeric(12, 2) NOT NULL,
  "date" date NOT NULL,
  "vendor" text,
  "note" text,
  "status" "erp_record_status" NOT NULL DEFAULT 'active',
  "recurring_rule_id" uuid,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_expenses_owner_date_idx" ON "erp_expenses" ("owner_id", "date");
CREATE INDEX "erp_expenses_category_idx" ON "erp_expenses" ("category_id", "date");

CREATE TABLE "erp_recurring_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turf_id" uuid REFERENCES "turfs"("id") ON DELETE SET NULL,
  "category_id" uuid NOT NULL REFERENCES "erp_expense_categories"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "frequency" "erp_rule_frequency" NOT NULL DEFAULT 'monthly',
  "next_due_date" date NOT NULL,
  "auto_post" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_rules_owner_due_idx" ON "erp_recurring_rules" ("owner_id", "next_due_date");

CREATE TABLE "erp_other_income" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turf_id" uuid REFERENCES "turfs"("id") ON DELETE SET NULL,
  "amount" numeric(12, 2) NOT NULL,
  "date" date NOT NULL,
  "source" text NOT NULL DEFAULT 'other',
  "note" text,
  "status" "erp_record_status" NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_other_income_owner_date_idx" ON "erp_other_income" ("owner_id", "date");

CREATE TABLE "erp_staff" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turf_id" uuid REFERENCES "turfs"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "phone" text,
  "position" "erp_staff_position" NOT NULL DEFAULT 'other',
  "position_other" text,
  "joined_at" date,
  "status" "erp_staff_status" NOT NULL DEFAULT 'active',
  "salary_type" "erp_salary_type" NOT NULL DEFAULT 'monthly',
  "base_salary" numeric(12, 2) NOT NULL DEFAULT '0',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_staff_owner_status_idx" ON "erp_staff" ("owner_id", "status");

CREATE TABLE "erp_salary_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "staff_id" uuid NOT NULL REFERENCES "erp_staff"("id") ON DELETE CASCADE,
  "period_month" date NOT NULL,
  "base_amount" numeric(12, 2) NOT NULL DEFAULT '0',
  "allowance" numeric(12, 2) NOT NULL DEFAULT '0',
  "overtime" numeric(12, 2) NOT NULL DEFAULT '0',
  "bonus" numeric(12, 2) NOT NULL DEFAULT '0',
  "deduction" numeric(12, 2) NOT NULL DEFAULT '0',
  "advance" numeric(12, 2) NOT NULL DEFAULT '0',
  "payable" numeric(12, 2) GENERATED ALWAYS AS (base_amount + allowance + overtime + bonus - deduction + advance) STORED NOT NULL,
  "paid_amount" numeric(12, 2) NOT NULL DEFAULT '0',
  "status" "erp_salary_status" NOT NULL DEFAULT 'pending',
  "paid_at" timestamp with time zone,
  "method" "erp_payment_method",
  "reference" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "erp_salary_staff_month_idx" ON "erp_salary_records" ("staff_id", "period_month");
CREATE INDEX "erp_salary_owner_month_idx" ON "erp_salary_records" ("owner_id", "period_month");

CREATE TABLE "erp_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "entity" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action" text NOT NULL,
  "amount" numeric(12, 2),
  "diff" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_audit_owner_entity_idx" ON "erp_audit_logs" ("owner_id", "entity", "entity_id");

-- Owner-wide booking aggregation support (audit §4: no turfs.owner_id index existed).
CREATE INDEX "turfs_owner_id_idx" ON "turfs" ("owner_id");
CREATE INDEX "bookings_date_idx" ON "bookings" ("date");

-- Backfill: one profile per existing turf owner. Trial anchored to the
-- owner's platform lifecycle — the earliest owned turf (covers both the
-- claim flow and self-created turfs), + 60 days.
INSERT INTO "erp_profiles" ("owner_id", "trial_starts_at", "trial_ends_at")
SELECT
  r.user_id,
  MIN(t.created_at),
  MIN(t.created_at) + INTERVAL '60 days'
FROM "user_roles" r
JOIN "turfs" t ON t."owner_id" = r."user_id"
WHERE r."role" = 'turf_owner'
GROUP BY r."user_id"
ON CONFLICT ("owner_id") DO NOTHING;
