-- 0018: ERP premium — manual MFS payment requests (bKash / Nagad / Rocket).
-- Owners send money to the DeshiTurf merchant number, submit txn id + optional
-- receipt image (Cloudinary public id), admins verify and grant premium.

CREATE TYPE "erp_premium_request_status" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "erp_premium_method" AS ENUM ('bkash', 'nagad', 'rocket');

CREATE TABLE "erp_premium_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "months" smallint NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "method" "erp_premium_method" NOT NULL,
  "sender_number" text NOT NULL,
  "transaction_id" text NOT NULL,
  "receipt_public_id" text,
  "status" "erp_premium_request_status" NOT NULL DEFAULT 'pending',
  "owner_note" text,
  "reject_reason" text,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "erp_premium_requests_owner_idx" ON "erp_premium_requests" ("owner_id", "created_at");
CREATE INDEX "erp_premium_requests_status_idx" ON "erp_premium_requests" ("status", "created_at");
