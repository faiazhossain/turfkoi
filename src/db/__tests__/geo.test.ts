import { describe, expect, it } from "vitest"

import { parseGeographyValue } from "@/db/geo"

/** Build an EWKB point hex string (the way Postgres renders geography). */
function ewkbPointHex(lng: number, lat: number, endian: "le" | "be") {
  const littleEndian = endian === "le"
  const bytes = new Uint8Array(25)
  const view = new DataView(bytes.buffer)
  bytes[0] = littleEndian ? 1 : 0
  // SRID flag (0x20000000) + base type POINT (1).
  view.setUint32(1, 0x20000001, littleEndian)
  view.setUint32(5, 4326, littleEndian)
  view.setFloat64(9, lng, littleEndian)
  view.setFloat64(17, lat, littleEndian)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

describe("parseGeographyValue", () => {
  it("parses the EWKB hex Postgres returns for geography on plain selects", () => {
    // Real value captured from the dev DB; ST_AsText confirms
    // POINT(90.364 23.826).
    expect(parseGeographyValue(
      "0101000020E61000009EEFA7C64B975640FA7E6ABC74D33740"
    )).toEqual({ lat: 23.826, lng: 90.364 })
  })

  it("parses little- and big-endian EWKB with SRID", () => {
    for (const endian of ["le", "be"] as const) {
      const hex = ewkbPointHex(90.4123, 23.8103, endian)
      const point = parseGeographyValue(hex)
      expect(point?.lng).toBeCloseTo(90.4123, 6)
      expect(point?.lat).toBeCloseTo(23.8103, 6)
    }
  })

  it("parses WKT text (sql-side ST_AsText selects)", () => {
    expect(parseGeographyValue("POINT(90.4 23.8)")).toEqual({
      lat: 23.8,
      lng: 90.4,
    })
  })

  it("returns null for empty input", () => {
    expect(parseGeographyValue(null)).toBeNull()
    expect(parseGeographyValue("")).toBeNull()
  })

  it("returns null for non-point or malformed values", () => {
    // Linestring (base type 2), truncated hex, garbage text.
    expect(parseGeographyValue(
      "0102000000020000000000000000985640E3A59BC420D03740"
    )).toBeNull()
    expect(parseGeographyValue("0101000020E61000")).toBeNull()
    expect(parseGeographyValue("not-a-point")).toBeNull()
  })
})
