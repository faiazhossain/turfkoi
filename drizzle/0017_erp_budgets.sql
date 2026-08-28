-- 0017: ERP Phase 3 — monthly budgets / business goals.
-- One row per owner per month; targets double as goals (PRD §19-20).

CREATE TABLE "erp_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month" date NOT NULL,
  "revenue_target" numeric(12, 2) NOT NULL DEFAULT '0',
  "expense_budget" numeric(12, 2) NOT NULL DEFAULT '0',
  "profit_target" numeric(12, 2) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "erp_budgets_owner_month_uniq" UNIQUE ("owner_id", "month")
);
