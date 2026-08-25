import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core"

import { turfs } from "./turfs"

/**
 * Turf gallery photos. Binaries live in Cloudinary (signed direct upload,
 * see features/images/service.ts); this table stores only the reference.
 * `provider` is kept so the storage backend can change without a rewrite.
 *
 * `is_cover` marks the photo shown as the turf's hero/card image; when no
 * cover is set, callers fall back to the lowest `sort_order`.
 */
export const turfPhotos = pgTable(
  "turf_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turfId: uuid("turf_id")
      .notNull()
      .references(() => turfs.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("cloudinary"),
    publicId: text("public_id").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("turf_photos_turf_sort_idx").on(t.turfId, t.sortOrder)]
)
