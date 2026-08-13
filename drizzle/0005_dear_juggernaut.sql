ALTER TABLE "player_profiles" ADD COLUMN "available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "played_confirmed_at" timestamp with time zone;