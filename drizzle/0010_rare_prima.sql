CREATE TABLE "turf_claim_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turf_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"target_email" text,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turfs" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "turf_claim_invites" ADD CONSTRAINT "turf_claim_invites_turf_id_turfs_id_fk" FOREIGN KEY ("turf_id") REFERENCES "public"."turfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_claim_invites" ADD CONSTRAINT "turf_claim_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_claim_invites" ADD CONSTRAINT "turf_claim_invites_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "turf_claim_invites_token_hash_idx" ON "turf_claim_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "turf_claim_invites_active_turf_idx" ON "turf_claim_invites" USING btree ("turf_id") WHERE claimed_at IS NULL AND revoked_at IS NULL;