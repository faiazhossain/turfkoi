-- SS32 location & map: PostGIS extension + GiST spatial indexes.
--
-- The geography(Point, 4326) columns (turfs.coords, player_profiles.coords)
-- already exist via Drizzle migrations, but the extension and GiST indexes
-- can't be expressed in Drizzle — apply this once per environment.
--
-- Usage:
--   psql $DATABASE_DIRECT_URL -f drizzle/postgis-gist.sql
-- (or run the statements in the Neon SQL editor)

CREATE EXTENSION IF NOT EXISTS postgis;

-- Radius/distance queries (ST_DWithin / ST_Distance) in
-- features/turfs/queries.ts and features/player/queries.ts.
CREATE INDEX IF NOT EXISTS turfs_coords_gist
  ON turfs USING gist (coords);

-- Available-players-near-turf discovery (listAvailablePlayersNearTurf).
CREATE INDEX IF NOT EXISTS player_profiles_coords_gist
  ON player_profiles USING gist (coords);
