"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Map as MLMap, Marker as MLMarker, Popup as MLPopup } from "maplibre-gl"

import { MapCanvas } from "./map-canvas"

export type MarkerKind = "turf" | "player"

const MARKER_ICONS: Record<MarkerKind, string> = {
  turf: "/stadium.svg",
  player: "/player.svg",
}

/** Turf pins swap to this variant while their popup is open (selected). */
const MARKER_ICONS_SELECTED: Partial<Record<MarkerKind, string>> = {
  turf: "/selected-stadium.svg",
}

export type MapMarker = {
  id: string
  lat: number
  lng: number
  label?: string
  /** When set, the marker popup renders as a link to this href. */
  href?: string
  /** Icon rendered for the pin — defaults to the turf icon. */
  kind?: MarkerKind
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
  fullscreen = true,
}: {
  markers: MapMarker[]
  center?: [number, number]
  zoom?: number
  className?: string
  ariaLabel?: string
  fullscreen?: boolean
}) {
  const [lib, setLib] = useState<typeof import("maplibre-gl") | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef(new Map<string, MLMarker>())
  // Only one popup may be open at a time — opening another closes this one.
  const activePopupRef = useRef<MLPopup | null>(null)

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
        const element = markerElement(m.kind ?? "turf")
        marker = new lib.Marker({ element })
          .setLngLat(lngLat)
          .setPopup(popup)
        // Custom elements don't get MapLibre's default click handler —
        // toggle the popup ourselves, keeping at most one open at a time.
        if (popup) {
          const kind = m.kind ?? "turf"
          const setSelected = (selected: boolean) => {
            element.src = selected
              ? MARKER_ICONS_SELECTED[kind] ?? MARKER_ICONS[kind]
              : MARKER_ICONS[kind]
            element.classList.toggle("size-11", selected)
            element.classList.toggle("size-9", !selected)
          }
          popup.on("open", () => setSelected(true))
          popup.on("close", () => {
            setSelected(false)
            if (activePopupRef.current === popup) {
              activePopupRef.current = null
            }
          })
          element.addEventListener("click", (e) => {
            e.stopPropagation()
            if (
              activePopupRef.current &&
              activePopupRef.current !== popup
            ) {
              activePopupRef.current.remove()
            }
            // togglePopup also sets the popup's lngLat — required, a bare
            // popup.addTo() renders nothing.
            marker!.togglePopup()
            activePopupRef.current = popup.isOpen() ? popup : null
          })
        }
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
      fullscreen={fullscreen}
    />
  )
}

function markerElement(kind: MarkerKind): HTMLImageElement {
  const el = document.createElement("img")
  el.src = MARKER_ICONS[kind]
  el.alt = ""
  el.draggable = false
  el.className =
    "size-9 cursor-pointer object-contain drop-shadow-md transition-all duration-150"
  return el
}

function popupContent(m: MapMarker): HTMLElement {
  const el = document.createElement("div")
  el.className = "min-w-32"
  const name = document.createElement("p")
  name.textContent = m.label ?? ""
  name.className = "text-sm font-medium leading-tight"
  el.appendChild(name)
  if (m.href) {
    const a = document.createElement("a")
    a.href = m.href
    a.textContent = "View details →"
    a.className =
      "mt-0.5 block text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
    el.appendChild(a)
  }
  return el
}
