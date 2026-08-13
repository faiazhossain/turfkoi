import type { MetadataRoute } from "next"

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://turfkoi.bd"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/turfs", "/matches"],
        // Authenticated + mutation surfaces stay out of the index.
        disallow: ["/app", "/team", "/turf-owner", "/admin", "/bookings", "/api"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
