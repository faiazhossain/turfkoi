"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl"

import { MapCanvas } from "./map-canvas"

export type MapMarker = {
  id: string
  lat: number
  lng: number
  label?: string
  /** When set, the marker popup renders as a link to this href. */
  href?: string
}

/**
 * Read-only map with pins (turf discovery, nearby players). Renders markers
 * from props, diffs on change, and fits bounds when there is more than one.
 */
export function MapView({
  markers,
  center,
  zoom = 12,
  className,
  ariaLabel = "Map",
}: {
  markers: MapMarker[]
  center?: [number, number]
  zoom?: number
  className?: string
  ariaLabel?: string
}) {
  const [lib, setLib] = useState<typeof import("maplibre-gl") | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef(new Map<string, MLMarker>())

  const handleReady = useCallback(
    (map: MLMap, maplibregl: typeof import("maplibre-gl")) => {
      mapRef.current = map
      setLib(maplibregl)
    },
    []
  )

  useEffect(() => {
    const map = mapRef.current
    if (!lib || !map) return

    const existing = markersRef.current
    const nextIds = new Set(markers.map((m) => m.id))

    // Remove stale markers.
    for (const [id, marker] of existing) {
      if (!nextIds.has(id)) {
        marker.remove()
        existing.delete(id)
      }
    }

    // Add or move current markers.
    for (const m of markers) {
      const lngLat: [number, number] = [m.lng, m.lat]
      let marker = existing.get(m.id)
      if (!marker) {
        const popup = m.label
          ? new lib.Popup({ offset: 24, closeButton: false }).setDOMContent(
              popupContent(m)
            )
          : undefined
        marker = new lib.Marker().setLngLat(lngLat).setPopup(popup)
        marker.addTo(map)
        existing.set(m.id, marker)
      } else {
        marker.setLngLat(lngLat)
      }
    }

    // Frame the results when there is more than one pin.
    if (markers.length > 1) {
      const bounds = new lib.LngLatBounds()
      for (const m of markers) bounds.extend([m.lng, m.lat])
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })
    } else if (markers.length === 1) {
      map.jumpTo({ center: [markers[0].lng, markers[0].lat], zoom })
    }
  }, [lib, markers, zoom])

  return (
    <MapCanvas
      center={center}
      zoom={zoom}
      className={className}
      onReady={handleReady}
      ariaLabel={ariaLabel}
    />
  )
}

function popupContent(m: MapMarker): HTMLElement {
  const el = document.createElement("div")
  el.className = "p-1 text-sm"
  if (m.href) {
    const a = document.createElement("a")
    a.href = m.href
    a.textContent = m.label ?? "View"
    a.className = "font-medium underline-offset-2 hover:underline"
    el.appendChild(a)
  } else {
    el.textContent = m.label ?? ""
  }
  return el
}
