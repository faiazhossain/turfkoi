import type { MetadataRoute } from "next"

import { db } from "@/db"
import { turfs } from "@/db/schema"
import { eq } from "drizzle-orm"

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://turfkoi.bd"

// Computed at request time (the turf list is live data; we don't want it
// baked into the build output, and `db` is unavailable at build time anyway).
export const dynamic = "force-dynamic"

/**
 * SEO sitemap. Indexes the static public pages + every verified, active turf.
 * Authenticated routes (/app, /team, /admin, …) are intentionally excluded —
 * they require sign-in and shouldn't be indexed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes = ["/", "/turfs", "/matches", "/login"].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: path === "/" ? 1 : 0.7,
  }))

  const verifiedTurfs = await db
    .select({ slug: turfs.slug, updatedAt: turfs.updatedAt })
    .from(turfs)
    .where(eq(turfs.isVerified, true))
    .limit(500)

  const turfRoutes = verifiedTurfs.map((t) => ({
    url: `${BASE}/turfs/${t.slug}`,
    lastModified: t.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  return [...staticRoutes, ...turfRoutes]
}
