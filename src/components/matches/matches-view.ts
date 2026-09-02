import type { GeoPoint } from "@/db/geo"
import { toBnDigits } from "@/lib/format-time"
import { roundCoords } from "@/lib/geo"
import type { OpenMatchSort } from "@/features/matches/queries"

export type MatchesView = {
  sort: OpenMatchSort
  coords: GeoPoint | null
}

/**
 * Parse the /matches discovery URL into a view. Sort is "near" only when the
 * param says so literally; coords are kept only when both parts are present,
 * finite, and in range — anything else degrades to no location (kickoff
 * order) instead of a broken map pin. Matches the /turfs page convention of
 * the URL being the single source of truth.
 */
export function parseMatchesView(sp: {
  sort?: string
  lat?: string
  lng?: string
}): MatchesView {
  const sort: OpenMatchSort = sp.sort === "near" ? "near" : "time"

  let coords: GeoPoint | null = null
  const lat = sp.lat ? Number(sp.lat) : NaN
  const lng = sp.lng ? Number(sp.lng) : NaN
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    coords = roundCoords({ lat, lng })
  }

  return { sort, coords }
}

/**
 * URL for a /matches view. Empty view -> the bare path; coords are written
 * at display precision (3 decimals, matching roundCoords) so the address bar
 * stays readable and never carries more precision than we actually keep.
 */
export function matchesViewUrl(view: MatchesView): string {
  const params = new URLSearchParams()
  if (view.coords) {
    params.set("lat", view.coords.lat.toFixed(3))
    params.set("lng", view.coords.lng.toFixed(3))
  }
  if (view.sort === "near") params.set("sort", "near")
  const query = params.toString()
  return query ? `/matches?${query}` : "/matches"
}

/** "1.8 km" with Bangla numerals for the bn locale (countdown convention). */
export function formatDistanceKm(km: number, locale: "en" | "bn"): string {
  const text = `${km.toFixed(1)} km`
  return locale === "bn" ? toBnDigits(text) : text
}
