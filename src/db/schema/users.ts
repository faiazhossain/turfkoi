import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { userStatus, userRole } from "./enums"
import { geographyPoint } from "../geo"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Login identifier: phone OR email + password. Phone stays the social key
  // (team invites match on it); email is where OTP verification goes.
  phone: text("phone").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
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
  // Public permanent gaming-style identity (Player Network). Never derived
  // from the internal uuid; safe to share; searchable (Player Network spec).
  playerId: text("player_id"),
  // Public handle used for secondary search. Unique, lowercase [a-z0-9_].
  username: text("username"),
  // Presence: refreshed (throttled) while the player browses signed-in pages.
  // "Online" = seen within the last 5 minutes.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  position: text("position"),
  skill: text("skill"),
  area: text("area"),
  // Identity fields (0019). bio/secondaryPosition stay plain text so legacy
  // free-text rows keep rendering; writes are constrained by Zod.
  bio: text("bio"),
  secondaryPosition: text("secondary_position"),
  // Avatar mode: "photo" (Cloudinary) | "preset" (catalog id below) | NULL
  // (legacy — photo when avatarPublicId is set, else the initials fallback).
  avatarType: text("avatar_type"),
  avatarPresetId: text("avatar_preset_id"),
  // Cloudinary public id of the avatar (asset in deshiturf/players/{userId}).
  avatarPublicId: text("avatar_public_id"),
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
}, (t) => [
  uniqueIndex("player_profiles_player_id_idx").on(t.playerId),
  uniqueIndex("player_profiles_username_idx").on(t.username),
])
