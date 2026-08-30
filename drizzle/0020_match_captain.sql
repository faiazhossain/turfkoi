-- 0020: Match captain — matches can be created without a team; the booking's
-- booker becomes the match captain (matches.captain_id). Backfilled from
-- bookings so every legacy match keeps a captain (they were required to be
-- the home team's owner/captain before this change).
-- Hand-applied: node scripts/apply-sql.mjs drizzle/0020_match_captain.sql

ALTER TABLE "matches" ADD COLUMN "captain_id" uuid;
--> statement-breakpoint
UPDATE "matches"
  SET "captain_id" = "bookings"."booker_id"
  FROM "bookings"
  WHERE "matches"."booking_id" = "bookings"."id";
--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "captain_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "matches"
  ADD CONSTRAINT "matches_captain_id_users_id_fk"
    FOREIGN KEY ("captain_id") REFERENCES "users"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_captain_idx" ON "matches" USING btree ("captain_id");
