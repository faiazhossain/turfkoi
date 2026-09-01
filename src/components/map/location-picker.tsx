"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl"
import { CrosshairIcon, MapPinIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader } from "@/components/ui/loader"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"
import {
  photonAutocompleteUrl,
  photonReverseUrl,
  photonToPlace,
  type PhotonFeature,
} from "@/lib/map"
import type { GeoPoint } from "@/db/geo"

import { MapCanvas } from "./map-canvas"

type SearchStatus = "idle" | "searching" | "done" | "error"

/** Best-effort place details resolved from a pick (search or reverse geocode). */
export type PickedPlace = {
  name: string
  city: string | null
  area: string
  /** Street-level address when Photon returns one; null otherwise. */
  address: string | null
}

/**
 * Location capture widget: search a place (Photon autocomplete, debounced),
 * tap the map, drag the pin, or use device geolocation. Emits the picked
 * coords plus best-effort place details for autofilling area/city fields.
 *
 * The consumer is responsible for privacy-rounding coords before persisting
 * (roundCoords, audit F7) — this component reports the exact pick.
 */
export function LocationPicker({
  value,
  onChange,
  className,
  label,
}: {
  value: GeoPoint | null
  onChange: (point: GeoPoint, place: PickedPlace | null) => void
  className?: string
  label?: string
}) {
  const { t } = useI18n()
  const labelOrDefault = label ?? t("map.location")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PhotonFeature[]>([])
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle")
  const [open, setOpen] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [reverseLoading, setReverseLoading] = useState(false)

  const [lib, setLib] = useState<typeof import("maplibre-gl") | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markerRef = useRef<MLMarker | null>(null)
  const searchSeq = useRef(0)
  const valueRef = useRef(value)
  // The query set programmatically by selectResult; the search effect skips
  // it so picking a result doesn't re-run the query and re-open the dropdown.
  // Cleared on the next manual keystroke.
  const suppressSearchRef = useRef<string | null>(null)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  // ----- Photon autocomplete (debounced 300ms) -----
  useEffect(() => {
    const seq = ++searchSeq.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      if (
        suppressSearchRef.current !== null &&
        query === suppressSearchRef.current
      ) {
        // Query came from selecting a result — keep the results (so a manual
        // refocus can reopen them) but don't search or drop the list again.
        setSearchStatus("idle")
        setOpen(false)
        return
      }
      if (query.trim().length < 3) {
        setResults([])
        setSearchStatus("idle")
        setOpen(false)
        return
      }
      try {
        setSearchStatus("searching")
        const res = await fetch(photonAutocompleteUrl(query.trim()), {
          signal: controller.signal,
        })
        if (seq !== searchSeq.current) return
        if (!res.ok) throw new Error(String(res.status))
        const data: { features?: PhotonFeature[] } = await res.json()
        setResults(data.features ?? [])
        setSearchStatus("done")
        setOpen(true)
      } catch (err) {
        if (controller.signal.aborted) return
        if (seq !== searchSeq.current) return
        setSearchStatus("error")
        setOpen(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // ----- Reverse geocode: coords -> place details -----
  const reverseGeocode = useCallback(
    async (point: GeoPoint) => {
      setReverseLoading(true)
      try {
        const res = await fetch(photonReverseUrl(point.lat, point.lng))
        if (!res.ok) throw new Error(String(res.status))
        const data: { features?: PhotonFeature[] } = await res.json()
        const feature = data.features?.[0]
        const place: PickedPlace | null = feature
          ? (() => {
              const p = photonToPlace(feature)
              return {
                name: p.name,
                city: p.city,
                area: p.area,
                address: p.address,
              }
            })()
          : null
        setPickedName(place?.name ?? null)
        onChange(point, place)
      } catch {
        // Non-fatal: still report the pick, just without place details.
        setPickedName(null)
        onChange(point, null)
      } finally {
        setReverseLoading(false)
      }
    },
    [onChange]
  )

  // ----- Map wiring: click-to-place + draggable pin -----
  const handleReady = useCallback(
    (map: MLMap, maplibregl: typeof import("maplibre-gl")) => {
      mapRef.current = map
      setLib(maplibregl)

      // Single draggable marker; moves to each new pick.
      const upsertMarker = (lng: number, lat: number) => {
        let marker = markerRef.current
        if (!marker) {
          marker = new maplibregl.Marker({ draggable: true }).setLngLat([lng, lat])
          marker.on("dragend", () => {
            const p = marker!.getLngLat()
            setPickedName(null)
            reverseGeocode({ lat: p.lat, lng: p.lng })
          })
          marker.addTo(map)
          markerRef.current = marker
        } else {
          marker.setLngLat([lng, lat])
        }
      }

      map.on("click", (e) => {
        upsertMarker(e.lngLat.lng, e.lngLat.lat)
        map.panTo([e.lngLat.lng, e.lngLat.lat])
        setPickedName(null)
        reverseGeocode({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })

      // Restore an existing value (edit flows) without re-geocoding it.
      if (valueRef.current) {
        const { lat, lng } = valueRef.current
        upsertMarker(lng, lat)
        map.jumpTo({ center: [lng, lat], zoom: 14 })
      }
    },
    [reverseGeocode]
  )

  useEffect(() => {
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [])

  // ----- Search result selection -----
  function selectResult(feature: PhotonFeature) {
    const place = photonToPlace(feature)
    suppressSearchRef.current = place.name
    setQuery(place.name)
    setOpen(false)

    const map = mapRef.current
    if (map) {
      let marker = markerRef.current
      if (!marker && lib) {
        marker = new lib.Marker({ draggable: true }).setLngLat([place.lng, place.lat])
        marker.on("dragend", () => {
          const p = marker!.getLngLat()
          setPickedName(null)
          reverseGeocode({ lat: p.lat, lng: p.lng })
        })
        marker.addTo(map)
        markerRef.current = marker
      } else if (marker) {
        marker.setLngLat([place.lng, place.lat])
      }
      map.panTo([place.lng, place.lat])
    }
    setPickedName(place.name)
    onChange(
      { lat: place.lat, lng: place.lng },
      {
        name: place.name,
        city: place.city,
        area: place.area,
        address: place.address,
      }
    )
  }

  // ----- Device geolocation -----
  function useMyLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false)
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const map = mapRef.current
        if (map) {
          if (markerRef.current) {
            markerRef.current.setLngLat([point.lng, point.lat])
          } else if (lib) {
            const marker = new lib.Marker({ draggable: true }).setLngLat([
              point.lng,
              point.lat,
            ])
            marker.on("dragend", () => {
              const p = marker.getLngLat()
              setPickedName(null)
              reverseGeocode({ lat: p.lat, lng: p.lng })
            })
            marker.addTo(map)
            markerRef.current = marker
          }
          map.panTo([point.lng, point.lat])
        }
        setPickedName(null)
        reverseGeocode(point)
      },
      () => {
        setGeoLoading(false)
        // Permission denied / unavailable: keep the current pick (if any)
        // and let the user place the pin manually instead.
        if (valueRef.current) {
          setPickedName(null)
          onChange(valueRef.current, null)
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-dt-dim"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => {
            suppressSearchRef.current = null
            setQuery(e.target.value)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t("map.searchPlaceholder", { label: labelOrDefault })}
          className="pl-8"
          aria-label={t("map.searchAria", { label: labelOrDefault })}
          autoComplete="off"
        />
        {searchStatus === "searching" ? (
          <Loader
            size={14}
            className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2"
            aria-hidden
          />
        ) : null}
        {open && results.length > 0 ? (
          <ul
            role="listbox"
            aria-label={t("map.resultsAria")}
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-dt-line bg-dt-card shadow-lg"
          >
            {results.map((f, i) => {
              const place = photonToPlace(f)
              return (
                <li key={`${place.lat},${place.lng},${i}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => selectResult(f)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-dt-card2"
                  >
                    <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-dt-dim" aria-hidden />
                    <span>
                      <span className="font-medium">{place.name}</span>
                      {place.area && place.area !== place.name ? (
                        <span className="block text-xs text-dt-dim">
                          {place.area}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <MapCanvas
        zoom={value ? 14 : 11}
        onReady={handleReady}
        className="h-64"
        ariaLabel={`${label} picker map`}
        fullscreen
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dt-dim">
        <span aria-live="polite">
          {reverseLoading ? (
            <Loader size={14} className="size-3.5" aria-hidden />
          ) : value ? (
            <>
              {pickedName ? `${pickedName} · ` : ""}
              {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
            </>
          ) : (
            t("map.hint")
          )}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={useMyLocation}
          loading={geoLoading}
        >
          <CrosshairIcon data-icon="inline-start" aria-hidden />
          {t("map.useMyLocation")}
        </Button>
      </div>
    </div>
  )
}
