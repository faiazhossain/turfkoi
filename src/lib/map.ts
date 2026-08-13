/**
 * SS32 location & map: BariKoi geocoding + MapLibre tiles + PostGIS queries.
 * Wired in Phase 2 (Turf management) / Phase 3 (Booking).
 */

export const BARIKOI_BASE_URL = "https://barikoi.com/api/v2"

export function barikoiAutocompleteUrl(query: string): string {
  const key = process.env.NEXT_PUBLIC_MAP_API_KEY ?? ""
  const q = encodeURIComponent(query)
  return `${BARIKOI_BASE_URL}/search/autocomplete/place?q=${q}&api_key=${key}`
}

export const MAP_TILES_URL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ?? ""
