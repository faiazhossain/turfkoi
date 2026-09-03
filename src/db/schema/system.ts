import { sql } from "drizzle-orm"
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { reportStatus } from "./enums"
import { users } from "./users"

/**
 * In-app notifications (Requirements §31 — in-app only in MVP, push/email
 * post-MVP). Payloads are denormalized at write time so rendering needs zero
 * joins. `type` maps to the registry in features/notifications/types.ts;
 * `entityType`/`entityId` power deep links. Never cached (§48).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    // info | transactional | critical (Requirements §31) — text not enum so
    // the registry stays the single source of truth.
    priority: text("priority").notNull().default("info"),
    payload: jsonb("payload"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Unread-badge count + keyset pagination (PERFORMANCE.md: index user_id,
    // read_at, created_at).
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ]
)

// H2: INSERT-only in production via a restricted DB role. actor_id is
// intentionally NOT a foreign key so audit history survives user deletion /
// PII anonymization (audit K3 - keep the hashed id, anonymize PII).
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  reason: text("reason").notNull(),
  status: reportStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [
  // One OPEN report per (reporter, entity) — blocks spam re-reports while a
  // report is still pending; re-reporting after resolution stays possible.
  uniqueIndex("reports_reporter_entity_pending")
    .on(t.reporterId, t.entityType, t.entityId)
    .where(sql`status = 'pending'`),
])
