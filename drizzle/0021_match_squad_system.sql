-- 0021: Match formats + squad system (Phase 1)
-- Format (on-field count per side) gains 9-a-side and 11-a-side; squad_size
-- is the per-side total INCLUDING substitutes (never implied by match_type);
-- match_players.squad_role seats players Starting vs Substitutes.
--
-- Applied 2026-08-30 to the dev Neon DB (statement-by-statement — neon-http
-- autocommits each query, so BEGIN/COMMIT wrappers are no-ops there).
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block;
-- the enum values were applied individually BEFORE this file:
--   ALTER TYPE match_type ADD VALUE 'nines';
--   ALTER TYPE match_type ADD VALUE 'elevens';
-- (idempotent on re-run: errors with "already exists" can be skipped)

DO $$ BEGIN
  CREATE TYPE squad_role AS ENUM ('starting', 'substitute');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS squad_size integer;

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS squad_role squad_role NOT NULL DEFAULT 'starting';

-- Preserve the previous ROSTER_LIMITS.max behaviour for existing matches.
UPDATE matches
SET squad_size = CASE match_type WHEN 'sevens' THEN 11 ELSE 8 END
WHERE squad_size IS NULL;

ALTER TABLE matches ALTER COLUMN squad_size SET NOT NULL;
