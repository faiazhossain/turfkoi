CREATE TYPE "public"."date_price_mode" AS ENUM('multiplier', 'absolute');--> statement-breakpoint
CREATE TABLE "turf_date_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turf_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"reason" text,
	"price_mode" date_price_mode,
	"price_value" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turf_date_exceptions" ADD CONSTRAINT "turf_date_exceptions_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "turf_date_exceptions_turf_date_unique" ON "turf_date_exceptions" USING btree ("turf_id","date");