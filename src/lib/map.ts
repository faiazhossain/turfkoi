/**
 * SS32 location & map: OpenFreeMap tiles + Photon geocoding (both free,
 * no API key) + MapLibre rendering. PostGIS queries live in feature queries.
 *
 * Photon (photon.komoot.io) is OSM-backed, keyless, and autocomplete-friendly.
 * Be a good citizen: debounce search input client-side (~300ms).
 */

export const MAP_TILES_URL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL?.trim() ||
  "https://tiles.openfreemap.org/styles/liberty"

const PHOTON_BASE_URL = "https://photon.komoot.io/api"

/** Search-as-you-type place autocomplete. Bias results to Bangladesh. */
export function photonAutocompleteUrl(query: string, limit = 5): string {
  const q = encodeURIComponent(query)
  return `${PHOTON_BASE_URL}/?q=${q}&limit=${limit}&lat=23.8103&lon=90.4125`
}

/** Reverse geocode: coords -> place name (for the area field on pick). */
export function photonReverseUrl(lat: number, lng: number): string {
  return `${PHOTON_BASE_URL}/reverse?lat=${lat}&lon=${lng}`
}

export type PhotonFeature = {
  geometry: { coordinates: [number, number] } // [lng, lat]
  properties: {
    name?: string
    street?: string
    city?: string
    state?: string
    countrycode?: string
    osm_key?: string
    osm_value?: string
  }
}

/** Flatten a Photon feature into Turfkoi's display + storage shapes. */
export function photonToPlace(feature: PhotonFeature) {
  const [lng, lat] = feature.geometry.coordinates
  const p = feature.properties
  const area = p.name ?? p.street ?? p.city ?? ""
  return {
    lat,
    lng,
    name: area,
    city: p.city ?? p.state ?? null,
    area: [p.street, p.city].filter(Boolean).join(", ") || area,
  }
}
