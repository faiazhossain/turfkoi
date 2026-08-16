import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core"

/**
 * Email OTP lifecycle (audit D1/D2, moved from phone to email). Codes are
 * hashed + short-lived; attempts and lockout are tracked here. Rate limiting
 * lives in Upstash (src/lib/ratelimit).
 */
export const otps = pgTable(
  "otps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("otps_email_created_idx").on(t.email, t.createdAt)]
)
