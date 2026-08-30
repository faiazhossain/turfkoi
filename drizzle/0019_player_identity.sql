-- 0019: Player identity — bio, secondary position, and the preset avatar
-- system (avatar_type "photo" | "preset" | NULL).
-- NULL avatar_type = legacy row: displays the photo when avatar_public_id is
-- set, else the initials fallback.
-- The preset-id whitelist lives in TS only
-- (src/features/player/avatar-catalog.ts) — the catalog is the single source
-- of truth, so SQL enforces length while the server action enforces
-- membership. Hand-applied: node scripts/apply-sql.mjs drizzle/0019_player_identity.sql

ALTER TABLE "player_profiles"
  ADD COLUMN "bio" text,
  ADD COLUMN "secondary_position" text,
  ADD COLUMN "avatar_type" text,
  ADD COLUMN "avatar_preset_id" text;

ALTER TABLE "player_profiles"
  ADD CONSTRAINT "player_profiles_avatar_type_check"
    CHECK ("avatar_type" IS NULL OR "avatar_type" IN ('photo', 'preset'));
ALTER TABLE "player_profiles"
  ADD CONSTRAINT "player_profiles_bio_len_check"
    CHECK (char_length("bio") <= 280);
ALTER TABLE "player_profiles"
  ADD CONSTRAINT "player_profiles_secondary_position_len_check"
    CHECK (char_length("secondary_position") <= 24);
ALTER TABLE "player_profiles"
  ADD CONSTRAINT "player_profiles_avatar_preset_id_len_check"
    CHECK (char_length("avatar_preset_id") <= 48);
