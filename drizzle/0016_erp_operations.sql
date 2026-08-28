-- 0016: ERP Phase 2 — rent contracts + maintenance records.
-- Design: docs/erp/ERP_TECH_DESIGN.md §1 (deferred tables).

CREATE TABLE "erp_rent_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turf_id" uuid REFERENCES "turfs"("id") ON DELETE SET NULL,
  "monthly_amount" numeric(12, 2) NOT NULL,
  "agreement_start" date,
  "agreement_end" date,
  "landlord_name" text,
  "landlord_phone" text,
  "security_deposit" numeric(12, 2) NOT NULL DEFAULT '0',
  "note" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "erp_rent_amount_positive" CHECK ("monthly_amount" > 0)
);
CREATE INDEX "erp_rent_owner_idx" ON "erp_rent_contracts" ("owner_id", "is_active");

CREATE TABLE "erp_maintenance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turf_id" uuid NOT NULL REFERENCES "turfs"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "category" text NOT NULL DEFAULT 'other',
  "description" text,
  "cost" numeric(12, 2) NOT NULL DEFAULT '0',
  "vendor" text,
  "status" text NOT NULL DEFAULT 'done',
  "slot_blocked_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_maintenance_owner_date_idx" ON "erp_maintenance_records" ("owner_id", "date");
