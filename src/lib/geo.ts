import type { GeoPoint } from "@/db/geo"

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * F7: round coordinates to 3 decimals (~110m) at WRITE time for player
 * privacy. Never round at read time - that leaks exact location to the client.
 */
export function roundCoords(point: GeoPoint, decimals = 3): GeoPoint {
  const factor = Math.pow(10, decimals)
  return {
    lat: Math.round(point.lat * factor) / factor,
    lng: Math.round(point.lng * factor) / factor,
  }
}

/** Haversine distance in km (SS32: "1.8 km away" display). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
