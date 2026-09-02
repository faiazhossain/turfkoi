-- 0026: Match event log — live "who scored / who saved / who tackled" plus
-- free commentary, written by a side captain or a captain-assigned recorder
-- (matches.recorder_id) while the match is ongoing. Player names are
-- snapshotted at write time so the timeline survives account anonymization
-- (which nulls users.name) and roster edits; event side is derived from the
-- roster row server-side, never from the client.
--
-- See 0025 header: applied statement-by-statement to the dev Neon DB
-- (neon-http autocommits each query; BEGIN/COMMIT wrappers are no-ops there).
-- NOTE: extending match_event_type later needs ALTER TYPE .. ADD VALUE,
-- which cannot run inside a transaction.

-- Guarded type creation (no CREATE TYPE IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_event_type') THEN
    CREATE TYPE match_event_type AS ENUM ('goal', 'save', 'tackle', 'note');
  END IF;
END $$;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS recorder_id uuid
  REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  -- Side of the event's player; null for player-less notes.
  side match_side,
  event_type match_event_type NOT NULL,
  -- Snapshot at write time: floor((now - kickoff_at) / 60000), clamped >= 0.
  -- Null when the match has no kickoff_at.
  minute integer,
  -- Exactly one of player_user_id / player_guest_id for stat events; both
  -- null for pure commentary.
  player_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  player_guest_id uuid REFERENCES match_guests (id) ON DELETE CASCADE,
  -- Display-name snapshot at write time (user name or masked phone /
  -- guest name).
  player_name text,
  note text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Note length mirrors the Zod cap (240); jersey CHECK (0025) is precedent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_events_note_len'
  ) THEN
    ALTER TABLE match_events
      ADD CONSTRAINT match_events_note_len CHECK (note IS NULL OR length(note) <= 240);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS match_events_match_idx
  ON match_events (match_id, created_at);

-- Post-apply checks:
--   SELECT typname FROM pg_type WHERE typname = 'match_event_type';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'matches' AND column_name = 'recorder_id';
--   SELECT count(*) FROM match_events;  -- expect 0
