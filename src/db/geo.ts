import { customType } from "drizzle-orm/pg-core"

export type GeoPoint = { lat: number; lng: number }

/**
 * PostGIS `geography(Point, 4326)` column.
 *
 * Notes (production wiring lands in Phase 2/3):
 *  - Requires `CREATE EXTENSION IF NOT EXISTS postgis;` on the Neon DB (run once).
 *  - Player coords are rounded to 3 decimals (~110m) at WRITE time in lib/geo
 *    (audit F7) - never rounded at read time (privacy).
 *  - Insert: toDriver emits WKT, which PostGIS accepts on insert.
 *  - Select: PostGIS returns EWKB by default; production selects use
 *    ST_AsText / ST_X / ST_Y via `sql`. fromDriver best-effort parses WKT.
 *  - GiST spatial indexes are added via a raw SQL migration; Drizzle can't
 *    express `CREATE INDEX ... USING gist` on a geography column natively.
 */
export const geographyPoint = customType<{
  data: GeoPoint | null
  driverData: string | null
}>({
  dataType() {
    return "geography(Point, 4326)"
  },
  toDriver(value: GeoPoint | null) {
    if (!value) return null
    return `POINT(${value.lng} ${value.lat})`
  },
  fromDriver(value: string | null): GeoPoint | null {
    if (!value) return null
    const match = /POINT\(([-\d.]+)\s+([-\d.]+)\)/i.exec(value)
    if (!match) return null
    return { lng: Number(match[1]), lat: Number(match[2]) }
  },
})
