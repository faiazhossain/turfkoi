-- Slot system P3.3: database-level overlap guard for turf_slots.
--
-- The composite PK blocks identical (turf, date, start_time) rows, but a
-- 19:30/90 slot next to a 19:00/60 slot would silently overlap. App-level
-- checks (addSlotAction, planMaterialization) are the primary guard; this
-- EXCLUDE constraint is the belt-and-suspenders that makes overlapping
-- inventory physically unrepresentable.
--
-- Implementation notes:
--   * btree_gist lets the EXCLUDE constraint mix a btree column (turf_id,
--     date) with a gist column (tsrange).
--   * The range is [start, start + duration) with `time`-based bounds. The
--     tsrange column is a generated STORED column so it can never drift from
--     start_time/duration_minutes; a BEFORE trigger keeps the base columns
--     in sync when the range is written.
--   * A slot ending exactly when another starts is NOT an overlap (upper
--     bound is exclusive) — back-to-back slots stay legal.
--   * Midnight wrap: a 23:30/90 slot's range ends at 01:00 of the NEXT
--     date, but the constraint groups by date, so a 00:30 slot on the next
--     date does not collide with it. Cross-midnight overlap is handled by
--     the app layer (addSlotAction's 3-day window + the planner). Documented
--     tradeoff, not a silent hole.
--   * Drizzle models slot_range in src/db/schema/turfs.ts (tsrange
--     customType + generatedAlwaysAs) so future migration diffs never try
--     to drop it. The function/trigger/EXCLUDE constraint below are
--     hand-written: drizzle-kit cannot express them, and generate would
--     otherwise not include them on a fresh database.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "turf_slots" ADD COLUMN "slot_range" "tsrange" GENERATED ALWAYS AS (tsrange(date + start_time, date + start_time + (duration_minutes || ' minutes')::interval, '[)')) STORED;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION turf_slots_sync_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slot_range IS DISTINCT FROM OLD.slot_range THEN
    NEW.start_time := (lower(NEW.slot_range))::time;
    NEW.duration_minutes := EXTRACT(EPOCH FROM upper(NEW.slot_range) - lower(NEW.slot_range)) / 60;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER turf_slots_sync_range
BEFORE INSERT OR UPDATE OF slot_range ON turf_slots
FOR EACH ROW EXECUTE FUNCTION turf_slots_sync_range();
--> statement-breakpoint
ALTER TABLE "turf_slots" ADD CONSTRAINT "turf_slots_no_overlap"
EXCLUDE USING gist (
  turf_id WITH =,
  date WITH =,
  slot_range WITH &&
);
