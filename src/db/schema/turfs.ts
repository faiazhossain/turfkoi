import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  numeric,
  integer,
  date,
  time,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { turfFormat, slotStatus, slotSource, cancellationPolicy } from "./enums"
import { geographyPoint } from "../geo"
import { users } from "./users"

export type CancellationPolicyConfig = {
  cutoffHours?: number
  tiers?: { withinHours: number; refundPercent: number }[]
}

// SS24: facilities surfaced on the turf (Phase 2 schema extension).
// Booleans default false at write time by the form layer. Unknown keys are
// owner-added custom facilities (name -> true) from the turf form's
// "add your own" input — jsonb is schemaless, so no migration needed.
export type Facilities = {
  indoor?: boolean
  outdoor?: boolean
  grassType?: string
  lighting?: boolean
  parking?: boolean
  changingRoom?: boolean
  shower?: boolean
  washroom?: boolean
  equipment?: boolean
  [custom: string]: boolean | string | undefined
}

export const turfs = pgTable("turfs", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // MVP single-owner canonical field (admin concierge-onboards turfs).
  // Multi-owner via turf_owners M:N is Post-MVP (audit A1).
  // Nullable: NULL means the turf is admin-seeded and awaiting the owner's
  // claim via a turf_claim_invites token (see turf-claims.ts).
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "restrict" }),
  coords: geographyPoint("coords").notNull(),
  format: turfFormat("format").notNull().default("fives"),
  city: text("city"),
  area: text("area"),
  address: text("address"),
  // SS24: descriptive + amenity fields (Phase 2 schema extension).
  // (Photos moved to the turf_photos table — Cloudinary-backed gallery.)
  description: text("description"),
  facilities: jsonb("facilities").$type<Facilities>(),
  // Turfs are admin-verified before going live (SS35).
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // Money-flow model: per-turf-owner cancellation policy.
  cancellationPolicy: cancellationPolicy("cancellation_policy")
    .notNull()
    .default("flexible"),
  cancellationPolicyConfig: jsonb("cancellation_policy_config").$type<CancellationPolicyConfig>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// M:N owners (Post-MVP multi-owner); MVP uses turfs.owner_id as canonical.
export const turfOwners = pgTable(
  "turf_owners",
  {
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.turfId, t.userId] })]
)

/**
 * Slot system P1: a named weekly schedule ("Regular week", "Ramadan hours").
 * One active schedule per turf (partial unique index below). Multiple saved
 * schedules + effective range is the seasonal-switch mechanism — activate a
 * Ramadan schedule for a month, switch back after Eid.
 */
export const turfSchedules = pgTable(
  "turf_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Null bounds mean unbounded; ignored until the schedule is activated.
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Exactly one active schedule per turf — materialization reads one.
    uniqueIndex("turf_schedules_one_active")
      .on(t.turfId)
      .where(sql`${t.isActive}`),
    index("turf_schedules_turf_idx").on(t.turfId),
  ]
)

/**
 * One "section" of a day in a schedule — the BD owner's mental unit:
 * "Morning 06:00-12:00 at 800", "Evening 17:00-23:00 at 1200". A section
 * carries its own slot duration, turnaround gap, and price, so peak/non-peak
 * pricing is structural, not a post-hoc modifier.
 *
 * endTime <= startTime means the window wraps past midnight (Ramadan night
 * hours like 22:00-03:00); slots starting after midnight are attributed to
 * the next calendar date.
 */
export const turfScheduleSections = pgTable(
  "turf_schedule_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => turfSchedules.id, { onDelete: "cascade" }),
    // 0 = Sunday ... 6 = Saturday, matching Date#getUTCDay.
    dayOfWeek: integer("day_of_week").notNull(),
    label: text("label"),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    // 30-180 in multiples of 5 (BD turfs run 45/60/75/90/120 min slots).
    slotMinutes: integer("slot_minutes").notNull().default(60),
    // Turnaround between consecutive slots (Team Ground runs 10 min).
    gapMinutes: integer("gap_minutes").notNull().default(0),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index("turf_schedule_sections_schedule_idx").on(t.scheduleId)]
)

export const turfSlots = pgTable(
  "turf_slots",
  {
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    // Owner-configurable slot length (Q5): any multiple of 5, 30-180 minutes.
    durationMinutes: integer("duration_minutes").notNull().default(60),
    status: slotStatus("status").notNull().default("available"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    // Slot system P1: template rows are regenerable; manual rows are the
    // owner's hand work and outrank the schedule forever.
    source: slotSource("source").notNull().default("template"),
    // Lineage: which schedule materialized this row. Null for manual adds
    // and legacy rows predating the schedule system.
    scheduleId: uuid("schedule_id").references(() => turfSchedules.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // F8: formalize the "PK-ish" - composite PK on (turf, date, start_time).
    primaryKey({ columns: [t.turfId, t.date, t.startTime] }),
    index("turf_slots_turf_date_idx").on(t.turfId, t.date),
  ]
)
