-- 0025: Guest identity — manually added players (match_guests) gain a
-- position and an optional jersey number, and their phones are healed to the
-- canonical +8801XXXXXXXXX form so a later signup with the same number links
-- the guest rows (match_guests.linked_user_id) and past matches surface in
-- the player's match history. match_invitations.invitee_phone gets the same
-- heal + link so phone invites reach the account that now owns the number
-- (linking never auto-accepts).
--
-- See 0024 header: applied statement-by-statement to the dev Neon DB
-- (neon-http autocommits each query; BEGIN/COMMIT wrappers are no-ops there).

ALTER TABLE match_guests ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE match_guests ADD COLUMN IF NOT EXISTS jersey_number integer;

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_guests_jersey_number_range'
  ) THEN
    ALTER TABLE match_guests
      ADD CONSTRAINT match_guests_jersey_number_range
      CHECK (jersey_number BETWEEN 0 AND 99);
  END IF;
END $$;

-- History linking reads guests by linked_user_id; no index exists today.
CREATE INDEX IF NOT EXISTS match_guests_linked_user_idx
  ON match_guests (linked_user_id);

-- Normalize, THEN link (order matters). Accepts the formats captains
-- actually type: 01XXXXXXXXX, 8801XXXXXXXXX, 10-digit, with stray
-- separators; mirrors normalizePhone() in src/features/auth/phone.ts.
UPDATE match_guests g
SET phone = CASE
  WHEN d.digits LIKE '880%'  THEN '+' || d.digits
  WHEN length(d.digits) = 10 THEN '+880' || d.digits
  ELSE '+880' || substr(d.digits, 2)          -- leading 0
END
FROM (
  SELECT id, regexp_replace(phone, '\D', '', 'g') AS digits
  FROM match_guests
  WHERE phone IS NOT NULL AND phone NOT LIKE '+8801%'
) d
WHERE g.id = d.id
  AND d.digits ~ '^(880)?0?1[3-9][0-9]{8}$';

UPDATE match_invitations i
SET invitee_phone = CASE
  WHEN d.digits LIKE '880%'  THEN '+' || d.digits
  WHEN length(d.digits) = 10 THEN '+880' || d.digits
  ELSE '+880' || substr(d.digits, 2)
END
FROM (
  SELECT id, regexp_replace(invitee_phone, '\D', '', 'g') AS digits
  FROM match_invitations
  WHERE invitee_phone IS NOT NULL AND invitee_phone NOT LIKE '+8801%'
) d
WHERE i.id = d.id
  AND d.digits ~ '^(880)?0?1[3-9][0-9]{8}$';

-- Link orphaned guest rows to accounts that already own the number.
UPDATE match_guests g
SET linked_user_id = u.id
FROM users u
WHERE g.linked_user_id IS NULL
  AND g.phone IS NOT NULL
  AND g.phone = u.phone;

-- Same heal for pending phone invitations — stored invites become
-- discoverable by the registered account (still never auto-accepts).
UPDATE match_invitations i
SET invitee_user_id = u.id
FROM users u
WHERE i.invitee_user_id IS NULL
  AND i.status = 'pending'
  AND i.invitee_phone IS NOT NULL
  AND i.invitee_phone = u.phone;

-- Post-apply checks (read-only, expect 0 / 0):
-- SELECT count(*) FROM match_guests
--  WHERE phone IS NOT NULL AND phone !~ '^\+8801[3-9]\d{8}$';
-- SELECT count(*) FROM match_guests g JOIN users u ON u.phone = g.phone
--  WHERE g.linked_user_id IS NULL AND g.phone IS NOT NULL;
