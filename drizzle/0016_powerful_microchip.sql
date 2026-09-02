CREATE TYPE "public"."wallet_claim_status" AS ENUM('pending', 'approved', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."wallet_entry_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wallet_entry_type" AS ENUM('topup', 'match_fee', 'credit', 'claim');--> statement-breakpoint
CREATE TABLE "wallet_balances" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "wallet_claim_status" DEFAULT 'pending' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "wallet_entry_type" NOT NULL,
	"status" "wallet_entry_status" DEFAULT 'success' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2),
	"match_id" uuid,
	"claim_id" uuid,
	"provider" "payment_provider",
	"provider_reference" text,
	"idempotency_key" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_claims" ADD CONSTRAINT "wallet_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_claims" ADD CONSTRAINT "wallet_claims_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_claim_id_wallet_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."wallet_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_claims_status_idx" ON "wallet_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wallet_entries_user_created_idx" ON "wallet_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_entries_match_idx" ON "wallet_entries" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "wallet_entries_status_idx" ON "wallet_entries" USING btree ("status");