CREATE TYPE "public"."match_event_type" AS ENUM('goal', 'save', 'tackle', 'note');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('wallet_topup', 'turf_booking');--> statement-breakpoint
CREATE TYPE "public"."payment_submission_status" AS ENUM('pending', 'rejected', 'consumed');--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"side" "match_side",
	"event_type" "match_event_type" NOT NULL,
	"minute" integer,
	"player_user_id" uuid,
	"player_guest_id" uuid,
	"player_name" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_id" uuid NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"booking_id" uuid,
	"transaction_id" text NOT NULL,
	"sender_number" text NOT NULL,
	"receipt_public_id" text,
	"user_note" text,
	"status" "payment_submission_status" DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"consumed_by" uuid,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "recorder_id" uuid;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_user_id_users_id_fk" FOREIGN KEY ("player_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_guest_id_match_guests_id_fk" FOREIGN KEY ("player_guest_id") REFERENCES "public"."match_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_consumed_by_users_id_fk" FOREIGN KEY ("consumed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_submissions_txid_live" ON "payment_submissions" USING btree ("transaction_id") WHERE status <> 'rejected';--> statement-breakpoint
CREATE INDEX "payment_submissions_status_idx" ON "payment_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_submissions_payer_idx" ON "payment_submissions" USING btree ("payer_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_submissions_booking_idx" ON "payment_submissions" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_recorder_id_users_id_fk" FOREIGN KEY ("recorder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_pending" ON "team_invitations" USING btree ("team_id","phone") WHERE fulfilled_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_period_unique" ON "payouts" USING btree ("turf_owner_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "match_invitations_user_pending" ON "match_invitations" USING btree ("match_id","side","invitee_user_id") WHERE status = 'pending' AND invitee_user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_invitations_phone_pending" ON "match_invitations" USING btree ("match_id","side","invitee_phone") WHERE status = 'pending' AND invitee_phone IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_entity_pending" ON "reports" USING btree ("reporter_id","entity_type","entity_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_claims_one_pending" ON "wallet_claims" USING btree ("user_id") WHERE status = 'pending';