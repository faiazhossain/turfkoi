CREATE TYPE "public"."user_anonymization_status" AS ENUM('pending', 'completed');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymize_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymization_status" "user_anonymization_status" DEFAULT 'pending' NOT NULL;