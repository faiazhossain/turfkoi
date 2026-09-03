// One-shot DDL for the manual-payment architecture (dev DB is push-managed;
// drizzle-kit push hit a TTY prompt on the new enums, so apply directly).
// Run: DATABASE_DIRECT_URL=... node scripts/ddl-manual-payments.mjs
import { neon } from "@neondatabase/serverless"
import { readFileSync } from "node:fs"

function envFromDotenv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
      }
    }
  } catch {}
}
envFromDotenv()

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error("No DATABASE_DIRECT_URL/DATABASE_URL")
  process.exit(1)
}
const sql = neon(url)

const IGNORABLE = ["already exists", "duplicate_object", "duplicate key"]
const stmts = [
  `CREATE TYPE "payment_purpose" AS ENUM ('wallet_topup', 'turf_booking')`,
  `CREATE TYPE "payment_submission_status" AS ENUM ('pending', 'rejected', 'consumed')`,
  `CREATE TABLE IF NOT EXISTS "payment_submissions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "payer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "purpose" "payment_purpose" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "booking_id" uuid REFERENCES "bookings"("id") ON DELETE RESTRICT,
    "transaction_id" text NOT NULL,
    "sender_number" text NOT NULL,
    "receipt_public_id" text,
    "user_note" text,
    "status" "payment_submission_status" DEFAULT 'pending' NOT NULL,
    "reject_reason" text,
    "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "reviewed_at" timestamp with time zone,
    "consumed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payment_submissions_txid_live"
    ON "payment_submissions" ("transaction_id") WHERE status <> 'rejected'`,
  `CREATE INDEX IF NOT EXISTS "payment_submissions_status_idx" ON "payment_submissions" ("status","created_at")`,
  `CREATE INDEX IF NOT EXISTS "payment_submissions_payer_idx" ON "payment_submissions" ("payer_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "payment_submissions_booking_idx" ON "payment_submissions" ("booking_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "wallet_claims_one_pending"
    ON "wallet_claims" ("user_id") WHERE status = 'pending'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "match_invitations_user_pending"
    ON "match_invitations" ("match_id","side","invitee_user_id")
    WHERE status = 'pending' AND invitee_user_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "match_invitations_phone_pending"
    ON "match_invitations" ("match_id","side","invitee_phone")
    WHERE status = 'pending' AND invitee_phone IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_pending"
    ON "team_invitations" ("team_id","phone") WHERE fulfilled_at IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payouts_period_unique"
    ON "payouts" ("turf_owner_id","period_start","period_end")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporter_entity_pending"
    ON "reports" ("reporter_id","entity_type","entity_id") WHERE status = 'pending'`,
]

let applied = 0
for (const stmt of stmts) {
  try {
    await sql.query(stmt)
    applied += 1
  } catch (err) {
    if (IGNORABLE.some((s) => err.message?.includes(s))) continue
    console.error("DDL failed:", err.message, "\nStatement:", stmt.slice(0, 120))
    process.exit(1)
  }
}
console.log(`DDL applied OK (${applied} new statements)`)
