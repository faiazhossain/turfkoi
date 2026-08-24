import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"

import { turfApplicationStatus } from "./enums"
import { geographyPoint } from "../geo"
import { turfs } from "./turfs"
import { users } from "./users"

/**
 * Owner-initiated "list my turf" applications. Captures supply-side intent
 * without letting anyone self-publish: the application is reviewed by an
 * admin, and approval seeds the turf + mints a claim invite (the existing
 * turf-claims flow). Nothing here is public-facing.
 *
 * Phone (WhatsApp) is the primary contact channel for BD turf owners; email
 * is optional and only used to pre-fill invite delivery.
 */
export const turfApplications = pgTable(
  "turf_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turfName: text("turf_name").notNull(),
    contactName: text("contact_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    city: text("city"),
    area: text("area"),
    address: text("address"),
    // Arrival instructions for players (e.g. metro landmark + rickshaw fare).
    notes: text("notes"),
    // Optional owner-drawn pin; admin verifies/fixes it at approval time
    // (coords are NOT NULL on turfs, so approval must supply one either way).
    coords: geographyPoint("coords"),
    status: turfApplicationStatus("status").notNull().default("pending"),
    // Set on approval: the turf seeded from this application.
    turfId: uuid("turf_id").references(() => turfs.id, {
      onDelete: "set null",
    }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("turf_applications_status_idx").on(t.status),
    index("turf_applications_turf_id_idx").on(t.turfId),
  ]
)
