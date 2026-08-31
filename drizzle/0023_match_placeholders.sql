-- 0023: Count-first matchmaking — captains declare "how many players I have"
-- without naming them. Per-side un-named seat counts; identities (registered
-- invites, guests) fill in progressively later from the match room.
-- Solo side lives on matches (no match_teams row exists for solo matches);
-- team sides (home/away) each carry their own count in match_teams.
-- Legacy matches: 0 = previous behaviour (every seat is an identity).

ALTER TABLE matches     ADD COLUMN IF NOT EXISTS placeholder_count integer NOT NULL DEFAULT 0;
ALTER TABLE match_teams ADD COLUMN IF NOT EXISTS placeholder_count integer NOT NULL DEFAULT 0;
