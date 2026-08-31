-- 0024: Person-based two-sided matchmaking — teams leave the match flow.
-- Sides become a plain column on match_players / match_guests /
-- match_invitations (home = creator side, away = claimed opponent side).
-- The away side is claimed by any signed-in player: matches.away_captain_id
-- is the FCFS guard, matches.away_placeholder_count their declared count.
-- match_teams / opponent_requests stay for legacy matches (reads only; no
-- new rows are written).
--
-- Backfill: side comes from the row's team's match_teams.side; rows without
-- a team (the solo side) are home. Away placeholders move from legacy away
-- team rows — the home declared count always lived on
-- matches.placeholder_count (even team matches wrote it there), so it needs
-- no backfill.
--
-- Applied statement-by-statement to the dev Neon DB (neon-http autocommits
-- each query; BEGIN/COMMIT wrappers are no-ops there).

ALTER TABLE match_players     ADD COLUMN IF NOT EXISTS side match_side NOT NULL DEFAULT 'home';
ALTER TABLE match_guests      ADD COLUMN IF NOT EXISTS side match_side NOT NULL DEFAULT 'home';
ALTER TABLE match_invitations ADD COLUMN IF NOT EXISTS side match_side NOT NULL DEFAULT 'home';

-- Team-based rows inherit their side; everything else (solo side) stays home.
UPDATE match_players mp
SET side = mt.side
FROM match_teams mt
WHERE mp.match_id = mt.match_id AND mp.team_id = mt.team_id;

UPDATE match_guests g
SET side = mt.side
FROM match_teams mt
WHERE g.match_id = mt.match_id AND g.team_id = mt.team_id;

UPDATE match_invitations i
SET side = mt.side
FROM match_teams mt
WHERE i.match_id = mt.match_id AND i.team_id = mt.team_id;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_captain_id uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_placeholder_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS matches_away_captain_idx ON matches (away_captain_id);

-- Legacy away teams' declared counts move onto the match. GREATEST keeps the
-- rare case where an away captain raised their count via the ± editor after
-- the challenge (that value lived on the match_teams row, not on matches).
UPDATE matches m
SET away_placeholder_count = GREATEST(m.away_placeholder_count, mt.placeholder_count)
FROM match_teams mt
WHERE mt.match_id = m.id AND mt.side = 'away';
