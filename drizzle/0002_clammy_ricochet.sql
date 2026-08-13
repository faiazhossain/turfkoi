ALTER TABLE "turfs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "turfs" ADD COLUMN "photos" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "turfs" ADD COLUMN "facilities" jsonb;