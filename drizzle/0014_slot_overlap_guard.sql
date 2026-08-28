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
--     start_time/duration_minutes. No trigger: a BEFORE trigger cannot see
--     the generated value (NEW.slot_range is NULL there), so any sync logic
--     would null out start_time and break every plain UPDATE.
--   * A slot ending exactly when another starts is NOT an overlap (upper
--     bound is exclusive) — back-to-back slots stay legal.
--   * Midnight wrap: a 23:30/90 slot's range ends at 01:00 of the NEXT
--     date, but the constraint groups by date, so a 00:30 slot on the next
--     date does not collide with it. Cross-midnight overlap is handled by
--     the app layer (addSlotAction's 3-day window + the planner). Documented
--     tradeoff, not a silent hole.
--   * Drizzle models slot_range in src/db/schema/turfs.ts (tsrange
--     customType + generatedAlwaysAs) so future migration diffs never try
--     to drop it. The EXCLUDE constraint below is hand-written:
--     drizzle-kit cannot express it, and generate would otherwise not
--     include it on a fresh database.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "turf_slots" ADD COLUMN "slot_range" "tsrange" GENERATED ALWAYS AS (tsrange(date + start_time, date + start_time + (duration_minutes || ' minutes')::interval, '[)')) STORED;
--> statement-breakpoint
ALTER TABLE "turf_slots" ADD CONSTRAINT "turf_slots_no_overlap"
EXCLUDE USING gist (
  turf_id WITH =,
  date WITH =,
  slot_range WITH &&
);
