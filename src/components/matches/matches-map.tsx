"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import type { GeoPoint } from "@/db/geo"
import { MapView, type MapMarker } from "@/components/map"
import { roundCoords } from "@/lib/geo"
import { matchesViewUrl } from "./matches-view"

/**
 * The matches hub map: battle pins where each open match plays, plus the
 * picked "you are here" pin when a location is set. Tapping the canvas sets
 * or moves that pin and switches to near sort — one click expresses intent.
 */
export function MatchesMap({
  markers,
  pickedPoint,
  ariaLabel,
}: {
  markers: MapMarker[]
  pickedPoint: GeoPoint | null
  ariaLabel: string
}) {
  const router = useRouter()
  // Re-tapping the same rounded spot must not re-navigate — this also
  // neutralizes clicks that fall through the pointer-events-none pin.
  const lastPickRef = useRef<string | null>(null)

  // Keep the dedupe key in sync with URL state (clear, back/forward).
  useEffect(() => {
    lastPickRef.current = pickedPoint
      ? `${pickedPoint.lat.toFixed(3)},${pickedPoint.lng.toFixed(3)}`
      : null
  }, [pickedPoint])

  function handlePick(point: GeoPoint) {
    const rounded = roundCoords(point)
    const key = `${rounded.lat.toFixed(3)},${rounded.lng.toFixed(3)}`
    if (lastPickRef.current === key) return
    lastPickRef.current = key
    router.push(matchesViewUrl({ sort: "near", coords: rounded }))
  }

  return (
    <MapView
      markers={markers}
      pickedPoint={pickedPoint}
      onPickPoint={handlePick}
      ariaLabel={ariaLabel}
      className="h-80"
    />
  )
}
