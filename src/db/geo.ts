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
 *  - Select: PostGIS geography renders as hex EWKB in text output; fromDriver
 *    parses both WKT and EWKB so plain `db.select()` rows work. SQL-side
 *    ST_AsText / ST_X / ST_Y remain the pattern for query-embedded values.
 *  - GiST spatial indexes are added via a raw SQL migration; Drizzle can't
 *    express `CREATE INDEX ... USING gist` on a geography column natively.
 */
/**
 * Decode a hex-encoded EWKB point into a GeoPoint. `geography` columns render
 * as hex EWKB in text output, so every driver that does not special-case
 * PostGIS (neon-http included) hands this format to fromDriver on plain
 * selects. Layout: byte order flag, uint32 type header (flags in the top
 * nibble: 0x80000000 Z, 0x40000000 M, 0x20000000 SRID), optional SRID, then
 * float64 X (lng) and Y (lat). Best-effort: anything unexpected -> null.
 */
function parseEwkbPoint(hex: string): GeoPoint | null {
  const normalized = hex.trim().toLowerCase()
  if (normalized.length < 42 || normalized.length % 2 !== 0) return null
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return null
    bytes[i] = byte
  }
  const view = new DataView(bytes.buffer)
  const littleEndian = bytes[0] === 1
  // Base type sits in the low bits (1 = POINT); the top nibble is flags.
  const header = view.getUint32(1, littleEndian)
  if ((header & 0x0fffffff) !== 1) return null
  let offset = 5
  if (header & 0x20000000) offset += 4 // skip SRID
  if (offset + 16 > bytes.length) return null
  const lng = view.getFloat64(offset, littleEndian)
  const lat = view.getFloat64(offset + 8, littleEndian)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lat, lng }
}

/**
 * fromDriver body, exported for tests: parses WKT text or hex-encoded EWKB
 * (geography's native text output on plain selects).
 */
export function parseGeographyValue(value: string | null): GeoPoint | null {
  if (!value) return null
  const match = /POINT\(([-\d.]+)\s+([-\d.]+)\)/i.exec(value)
  if (match) return { lng: Number(match[1]), lat: Number(match[2]) }
  return parseEwkbPoint(value)
}

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
    return parseGeographyValue(value)
  },
})
