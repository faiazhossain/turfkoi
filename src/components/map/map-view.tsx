"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Map as MLMap, Marker as MLMarker, Popup as MLPopup } from "maplibre-gl"

import type { GeoPoint } from "@/db/geo"
import { useI18n } from "@/i18n/client"

import { MapCanvas } from "./map-canvas"

export type MarkerKind = "turf" | "player" | "battle" | "me"

const MARKER_ICONS: Record<MarkerKind, string> = {
  turf: "/stadium.svg",
  player: "/player.svg",
  battle: "/battle.svg",
  me: "/me.svg",
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
  /** Dim second line in the popup (e.g. the venue under a match title). */
  subtitle?: string
  /** When set, the marker popup renders as a link to this href. */
  href?: string
  /** Icon rendered for the pin — defaults to the turf icon. */
  kind?: MarkerKind
  /** Epoch ms when a battle pin flips to its live fighting animation. */
  liveAt?: number
}

/**
 * Read-only map with pins (turf discovery, nearby players). Renders markers
 * from props, diffs on change, and fits bounds when there is more than one.
 *
 * Optional pick mode: `pickedPoint` draws a non-interactive "you are here"
 * pin (excluded from the bounds framing) and `onPickPoint` fires for plain
 * canvas clicks — marker clicks stopPropagation, so pins never double-fire.
 */
export function MapView({
  markers,
  pickedPoint = null,
  onPickPoint,
  center,
  zoom = 12,
  className,
  ariaLabel = "Map",
  fullscreen = true,
}: {
  markers: MapMarker[]
  pickedPoint?: GeoPoint | null
  onPickPoint?: (point: GeoPoint) => void
  center?: [number, number]
  zoom?: number
  className?: string
  ariaLabel?: string
  fullscreen?: boolean
}) {
  const [lib, setLib] = useState<typeof import("maplibre-gl") | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef(new Map<string, MLMarker>())
  const pickedMarkerRef = useRef<MLMarker | null>(null)
  // Battle wrappers that can flip to the live animation, by marker id.
  const battleMarkersRef = useRef(
    new Map<string, { wrap: HTMLElement; liveAt: number }>()
  )
  // Deferred clock (KickoffCountdown's hydration-safe pattern): null until
  // mounted, then a 1s tick — only while some pin can actually go live.
  const [now, setNow] = useState<number | null>(null)
  const nowRef = useRef<number | null>(null)
  // Only one popup may be open at a time — opening another closes this one.
  const activePopupRef = useRef<MLPopup | null>(null)
  // Latest pick handler without re-registering the map listener.
  const onPickPointRef = useRef(onPickPoint)
  // Last locale-derived popup label — markers rebuild when it changes.
  const popupLabelRef = useRef<string | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    onPickPointRef.current = onPickPoint
  }, [onPickPoint])

  useEffect(() => {
    if (!markers.some((m) => m.liveAt != null)) return
    const tick = () => {
      nowRef.current = Date.now()
      setNow(nowRef.current)
    }
    // First tick is deferred (rAF, not sync) — a synchronous setState here
    // would trigger cascading renders (react-hooks rule).
    const raf = requestAnimationFrame(tick)
    const id = setInterval(tick, 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(id)
    }
  }, [markers])

  // Flip battle pins to the fighting animation once kickoff passes.
  useEffect(() => {
    if (now === null) return
    for (const { wrap, liveAt } of battleMarkersRef.current.values()) {
      wrap.classList.toggle("battle-live", now >= liveAt)
    }
  }, [now])

  const handleReady = useCallback(
    (map: MLMap, maplibregl: typeof import("maplibre-gl")) => {
      mapRef.current = map
      setLib(maplibregl)
      map.on("click", (e) => {
        onPickPointRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })
    },
    []
  )

  // ----- "You are here" pin — separate from data markers on purpose: it has
  // no popup, ignores pointer events, and must not stretch the bounds frame.
  useEffect(() => {
    const map = mapRef.current
    if (!lib || !map) return

    if (!pickedPoint) {
      pickedMarkerRef.current?.remove()
      pickedMarkerRef.current = null
      return
    }

    if (!pickedMarkerRef.current) {
      const { root } = markerElement("me")
      root.className =
        "size-9 pointer-events-none object-contain drop-shadow-md"
      pickedMarkerRef.current = new lib.Marker({ element: root })
        .setLngLat([pickedPoint.lng, pickedPoint.lat])
        .addTo(map)
    } else {
      pickedMarkerRef.current.setLngLat([pickedPoint.lng, pickedPoint.lat])
    }
  }, [lib, pickedPoint])

  useEffect(() => {
    const map = mapRef.current
    if (!lib || !map) return

    const existing = markersRef.current
    const viewDetailsLabel = `${t("common.viewDetails")} →`

    // A locale switch rewrites popup labels — rebuild pins rather than diff.
    if (popupLabelRef.current !== viewDetailsLabel) {
      popupLabelRef.current = viewDetailsLabel
      for (const marker of existing.values()) marker.remove()
      existing.clear()
      activePopupRef.current = null
    }

    const nextIds = new Set(markers.map((m) => m.id))

    // Remove stale markers.
    for (const [id, marker] of existing) {
      if (!nextIds.has(id)) {
        marker.remove()
        existing.delete(id)
        battleMarkersRef.current.delete(id)
      }
    }

    // Add or move current markers.
    for (const m of markers) {
      const lngLat: [number, number] = [m.lng, m.lat]
      let marker = existing.get(m.id)
      if (!marker) {
        const popup = m.label
          ? new lib.Popup({ offset: 24, closeButton: false }).setDOMContent(
              popupContent(m, viewDetailsLabel)
            )
          : undefined
        const kind = m.kind ?? "turf"
        // Battle pins wrap their img so globals.css can clash-animate the
        // blades and pulse a shockwave ring around the turf once live.
        const { root, icon } = markerElement(kind)
        marker = new lib.Marker({ element: root })
          .setLngLat(lngLat)
          .setPopup(popup)
        // Custom elements don't get MapLibre's default click handler —
        // toggle the popup ourselves, keeping at most one open at a time.
        if (popup) {
          const setSelected = (selected: boolean) => {
            icon.src = selected
              ? MARKER_ICONS_SELECTED[kind] ?? MARKER_ICONS[kind]
              : MARKER_ICONS[kind]
            icon.classList.toggle("size-11", selected)
            icon.classList.toggle("size-9", !selected)
          }
          popup.on("open", () => setSelected(true))
          popup.on("close", () => {
            setSelected(false)
            if (activePopupRef.current === popup) {
              activePopupRef.current = null
            }
          })
          root.addEventListener("click", (e) => {
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
        if (m.kind === "battle" && m.liveAt != null) {
          battleMarkersRef.current.set(m.id, {
            wrap: root,
            liveAt: m.liveAt,
          })
          if (nowRef.current !== null && nowRef.current >= m.liveAt) {
            root.classList.add("battle-live")
          }
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
  }, [lib, markers, zoom, t])

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

/**
 * Battle pins get a wrapper element so globals.css can clash-animate the
 * blade img and pulse a shockwave ring around it; other kinds stay a bare
 * img. `icon` is the img either way — selected-swap and size toggles target
 * it, while MapLibre positions `root`.
 */
function markerElement(kind: MarkerKind): {
  root: HTMLElement
  icon: HTMLImageElement
} {
  const icon = document.createElement("img")
  icon.src = MARKER_ICONS[kind]
  icon.alt = ""
  icon.draggable = false
  icon.className =
    "size-9 cursor-pointer object-contain drop-shadow-md transition-all duration-150"
  if (kind !== "battle") return { root: icon, icon }

  const wrap = document.createElement("div")
  wrap.className = "battle-marker flex size-9 items-center justify-center"
  wrap.appendChild(icon)
  return { root: wrap, icon }
}

function popupContent(m: MapMarker, viewDetailsLabel: string): HTMLElement {
  const el = document.createElement("div")
  el.className = "min-w-32"
  const name = document.createElement("p")
  name.textContent = m.label ?? ""
  name.className = "text-sm font-medium leading-tight"
  el.appendChild(name)
  if (m.subtitle) {
    const subtitle = document.createElement("p")
    subtitle.textContent = m.subtitle
    subtitle.className = "mt-0.5 text-xs text-dt-dim"
    el.appendChild(subtitle)
  }
  if (m.href) {
    const a = document.createElement("a")
    a.href = m.href
    a.textContent = viewDetailsLabel
    a.className =
      "mt-0.5 block text-xs text-dt-dim underline-offset-2 transition-colors hover:text-dt-txt hover:underline"
    el.appendChild(a)
  }
  return el
}
