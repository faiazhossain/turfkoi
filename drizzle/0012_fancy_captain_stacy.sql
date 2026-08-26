CREATE TYPE "public"."slot_source" AS ENUM('template', 'manual');--> statement-breakpoint
CREATE TABLE "turf_schedule_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"label" text,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"slot_minutes" integer DEFAULT 60 NOT NULL,
	"gap_minutes" integer DEFAULT 0 NOT NULL,
	"price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turf_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turf_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turf_slots" ADD COLUMN "source" "slot_source" DEFAULT 'template' NOT NULL;--> statement-breakpoint
ALTER TABLE "turf_slots" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "turf_schedule_sections" ADD CONSTRAINT "turf_schedule_sections_schedule_id_turf_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."turf_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_schedules" ADD CONSTRAINT "turf_schedules_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turf_schedule_sections_schedule_idx" ON "turf_schedule_sections" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turf_schedules_one_active" ON "turf_schedules" USING btree ("turf_id") WHERE "turf_schedules"."is_active";--> statement-breakpoint
CREATE INDEX "turf_schedules_turf_idx" ON "turf_schedules" USING btree ("turf_id");--> statement-breakpoint
ALTER TABLE "turf_slots" ADD CONSTRAINT "turf_slots_schedule_id_turf_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."turf_schedules"("id") ON DELETE set null ON UPDATE no action;