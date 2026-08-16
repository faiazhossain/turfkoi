DROP INDEX "otps_phone_created_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "otps_email_created_idx" ON "otps" USING btree ("email","created_at");