CREATE TABLE "owner_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_login_codes" ADD CONSTRAINT "owner_login_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_login_codes_phone_idx" ON "owner_login_codes" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_login_codes_active_phone_idx" ON "owner_login_codes" USING btree ("phone") WHERE consumed_at IS NULL AND revoked_at IS NULL;
