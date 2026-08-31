-- 0022: Match invitations, temp guests, friends (Phase 2)
-- Applied 2026-08-31 to the dev Neon DB statement-by-statement (neon-http
-- autocommits each query, so transaction wrappers are no-ops there).
-- No DO $$ blocks (statement splitting doesn't parse dollar quotes) —
-- re-running relies on the applier skipping "already exists" errors.

CREATE TYPE invitation_status AS ENUM ('pending','accepted','declined','cancelled','expired');

CREATE TYPE friendship_status AS ENUM ('pending','accepted','declined');

CREATE TABLE IF NOT EXISTS match_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  invitee_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  invitee_phone text,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  squad_role_wanted squad_role NOT NULL DEFAULT 'starting',
  status invitation_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_invitations_match_idx ON match_invitations (match_id);
CREATE INDEX IF NOT EXISTS match_invitations_invitee_idx ON match_invitations (invitee_user_id);
CREATE INDEX IF NOT EXISTS match_invitations_phone_idx ON match_invitations (invitee_phone);

CREATE TABLE IF NOT EXISTS match_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  linked_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  squad_role squad_role NOT NULL DEFAULT 'starting',
  added_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_guests_match_idx ON match_guests (match_id);
CREATE INDEX IF NOT EXISTS match_guests_phone_idx ON match_guests (phone);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);
