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
} from "drizzle-orm/pg-core"

import { turfFormat, slotStatus, cancellationPolicy } from "./enums"
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

export const turfSlots = pgTable(
  "turf_slots",
  {
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    // Owner-configurable slot length (Q5): 60 or 90 minutes.
    durationMinutes: integer("duration_minutes").notNull().default(60),
    status: slotStatus("status").notNull().default("available"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [
    // F8: formalize the "PK-ish" - composite PK on (turf, date, start_time).
    primaryKey({ columns: [t.turfId, t.date, t.startTime] }),
    index("turf_slots_turf_date_idx").on(t.turfId, t.date),
  ]
)
