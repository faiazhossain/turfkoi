import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core"

import { userStatus, userRole } from "./enums"
import { geographyPoint } from "../geo"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Phone is the primary identifier (audit D1). Email is optional.
  phone: text("phone").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  status: userStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// M:N: a single user can be player + team_owner + turf_owner simultaneously (SS5).
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })]
)

export const playerProfiles = pgTable("player_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  position: text("position"),
  skill: text("skill"),
  area: text("area"),
  coords: geographyPoint("coords"),
  // Phase 6: "Available tonight" toggle (SS18). When true + availableAt is
  // recent, the player appears in nearby "needs players" discovery.
  available: boolean("available").notNull().default(false),
  availableAt: timestamp("available_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
