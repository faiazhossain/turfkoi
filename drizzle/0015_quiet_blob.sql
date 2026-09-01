CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."squad_role" AS ENUM('starting', 'substitute');--> statement-breakpoint
CREATE TYPE "public"."erp_expense_source" AS ENUM('manual', 'salary', 'bill', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."erp_payment_method" AS ENUM('cash', 'bkash', 'nagad', 'bank');--> statement-breakpoint
CREATE TYPE "public"."erp_premium_method" AS ENUM('bkash', 'nagad', 'rocket');--> statement-breakpoint
CREATE TYPE "public"."erp_premium_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."erp_record_status" AS ENUM('active', 'void');--> statement-breakpoint
CREATE TYPE "public"."erp_rule_frequency" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."erp_salary_status" AS ENUM('pending', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "public"."erp_salary_type" AS ENUM('monthly', 'daily', 'hourly', 'commission');--> statement-breakpoint
CREATE TYPE "public"."erp_staff_position" AS ENUM('manager', 'receptionist', 'ground_staff', 'cleaner', 'security', 'maintenance', 'accountant', 'coach', 'other');--> statement-breakpoint
CREATE TYPE "public"."erp_staff_status" AS ENUM('active', 'inactive');--> statement-breakpoint
ALTER TYPE "public"."match_type" ADD VALUE 'nines';--> statement-breakpoint
ALTER TYPE "public"."match_type" ADD VALUE 'elevens';--> statement-breakpoint
CREATE TABLE "match_guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_id" uuid,
	"side" "match_side" DEFAULT 'home' NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"position" text,
	"jersey_number" integer,
	"linked_user_id" uuid,
	"squad_role" "squad_role" DEFAULT 'starting' NOT NULL,
	"added_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_id" uuid,
	"side" "match_side" DEFAULT 'home' NOT NULL,
	"invitee_user_id" uuid,
	"invitee_phone" text,
	"invited_by" uuid NOT NULL,
	"squad_role_wanted" "squad_role" DEFAULT 'starting' NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"amount" numeric(12, 2),
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"month" date NOT NULL,
	"revenue_target" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expense_budget" numeric(12, 2) DEFAULT '0' NOT NULL,
	"profit_target" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'variable' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"turf_id" uuid,
	"category_id" uuid NOT NULL,
	"source" "erp_expense_source" DEFAULT 'manual' NOT NULL,
	"source_ref_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"vendor" text,
	"note" text,
	"status" "erp_record_status" DEFAULT 'active' NOT NULL,
	"recurring_rule_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"turf_id" uuid NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"description" text,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vendor" text,
	"status" text DEFAULT 'done' NOT NULL,
	"slot_blocked_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_other_income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"turf_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"source" text DEFAULT 'other' NOT NULL,
	"note" text,
	"status" "erp_record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_premium_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"months" smallint NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "erp_premium_method" NOT NULL,
	"sender_number" text NOT NULL,
	"transaction_id" text NOT NULL,
	"receipt_public_id" text,
	"status" "erp_premium_request_status" DEFAULT 'pending' NOT NULL,
	"owner_note" text,
	"reject_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_profiles" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"trial_starts_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"premium_until" timestamp with time zone,
	"onboarded_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_recurring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"turf_id" uuid,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"frequency" "erp_rule_frequency" DEFAULT 'monthly' NOT NULL,
	"next_due_date" date NOT NULL,
	"auto_post" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_rent_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"turf_id" uuid,
	"monthly_amount" numeric(12, 2) NOT NULL,
	"agreement_start" date,
	"agreement_end" date,
	"landlord_name" text,
	"landlord_phone" text,
	"security_deposit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erp_rent_amount_positive" CHECK (monthly_amount > 0)
);
--> statement-breakpoint
CREATE TABLE "erp_salary_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"base_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"overtime" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"advance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payable" numeric(12, 2) GENERATED ALWAYS AS (base_amount + allowance + overtime + bonus - deduction + advance) STORED NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "erp_salary_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"method" "erp_payment_method",
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"turf_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"position" "erp_staff_position" DEFAULT 'other' NOT NULL,
	"position_other" text,
	"joined_at" date,
	"status" "erp_staff_status" DEFAULT 'active' NOT NULL,
	"salary_type" "erp_salary_type" DEFAULT 'monthly' NOT NULL,
	"base_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "player_id" text;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "secondary_position" text;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "avatar_type" text;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "avatar_preset_id" text;--> statement-breakpoint
ALTER TABLE "turfs" ADD COLUMN "booking_horizon_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "side" "match_side" DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "squad_role" "squad_role" DEFAULT 'starting' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_teams" ADD COLUMN "placeholder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "captain_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_captain_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "squad_size" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "placeholder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_placeholder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "share_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "opponent_requests" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
ALTER TABLE "opponent_requests" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_guests" ADD CONSTRAINT "match_guests_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_guests" ADD CONSTRAINT "match_guests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_guests" ADD CONSTRAINT "match_guests_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_guests" ADD CONSTRAINT "match_guests_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_invitations" ADD CONSTRAINT "match_invitations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_invitations" ADD CONSTRAINT "match_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_invitations" ADD CONSTRAINT "match_invitations_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_invitations" ADD CONSTRAINT "match_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_audit_logs" ADD CONSTRAINT "erp_audit_logs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_audit_logs" ADD CONSTRAINT "erp_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_budgets" ADD CONSTRAINT "erp_budgets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_expense_categories" ADD CONSTRAINT "erp_expense_categories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_category_id_erp_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."erp_expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_maintenance_records" ADD CONSTRAINT "erp_maintenance_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_maintenance_records" ADD CONSTRAINT "erp_maintenance_records_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_other_income" ADD CONSTRAINT "erp_other_income_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_other_income" ADD CONSTRAINT "erp_other_income_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_premium_requests" ADD CONSTRAINT "erp_premium_requests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_premium_requests" ADD CONSTRAINT "erp_premium_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_profiles" ADD CONSTRAINT "erp_profiles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_recurring_rules" ADD CONSTRAINT "erp_recurring_rules_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_recurring_rules" ADD CONSTRAINT "erp_recurring_rules_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_recurring_rules" ADD CONSTRAINT "erp_recurring_rules_category_id_erp_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."erp_expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_rent_contracts" ADD CONSTRAINT "erp_rent_contracts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_rent_contracts" ADD CONSTRAINT "erp_rent_contracts_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_salary_records" ADD CONSTRAINT "erp_salary_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_salary_records" ADD CONSTRAINT "erp_salary_records_staff_id_erp_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."erp_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_staff" ADD CONSTRAINT "erp_staff_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_staff" ADD CONSTRAINT "erp_staff_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_guests_match_idx" ON "match_guests" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_guests_phone_idx" ON "match_guests" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "match_invitations_match_idx" ON "match_invitations" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_invitations_invitee_idx" ON "match_invitations" USING btree ("invitee_user_id");--> statement-breakpoint
CREATE INDEX "match_invitations_phone_idx" ON "match_invitations" USING btree ("invitee_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_idx" ON "friendships" USING btree ("requester_id","addressee_id");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_pair_idx" ON "user_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "erp_audit_owner_entity_idx" ON "erp_audit_logs" USING btree ("owner_id","entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "erp_budgets_owner_month_uniq" ON "erp_budgets" USING btree ("owner_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "erp_categories_owner_slug_idx" ON "erp_expense_categories" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE INDEX "erp_expenses_owner_date_idx" ON "erp_expenses" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "erp_expenses_category_idx" ON "erp_expenses" USING btree ("category_id","date");--> statement-breakpoint
CREATE INDEX "erp_maintenance_owner_date_idx" ON "erp_maintenance_records" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "erp_other_income_owner_date_idx" ON "erp_other_income" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "erp_premium_requests_owner_idx" ON "erp_premium_requests" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "erp_premium_requests_status_idx" ON "erp_premium_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "erp_rules_owner_due_idx" ON "erp_recurring_rules" USING btree ("owner_id","next_due_date");--> statement-breakpoint
CREATE INDEX "erp_rent_owner_idx" ON "erp_rent_contracts" USING btree ("owner_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "erp_salary_staff_month_idx" ON "erp_salary_records" USING btree ("staff_id","period_month");--> statement-breakpoint
CREATE INDEX "erp_salary_owner_month_idx" ON "erp_salary_records" USING btree ("owner_id","period_month");--> statement-breakpoint
CREATE INDEX "erp_staff_owner_status_idx" ON "erp_staff" USING btree ("owner_id","status");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_captain_id_users_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_captain_id_users_id_fk" FOREIGN KEY ("away_captain_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_requests" ADD CONSTRAINT "opponent_requests_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_profiles_player_id_idx" ON "player_profiles" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_profiles_username_idx" ON "player_profiles" USING btree ("username");--> statement-breakpoint
CREATE INDEX "matches_captain_idx" ON "matches" USING btree ("captain_id");--> statement-breakpoint
CREATE INDEX "matches_away_captain_idx" ON "matches" USING btree ("away_captain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_share_token_idx" ON "matches" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "opponent_requests_match_status_idx" ON "opponent_requests" USING btree ("match_id","status");