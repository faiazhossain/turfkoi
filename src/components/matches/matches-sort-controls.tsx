"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownWideNarrowIcon,
  CrosshairIcon,
  MapPinIcon,
  XIcon,
} from "lucide-react"

import { useI18n } from "@/i18n/client"
import { Button } from "@/components/ui/button"
import { roundCoords } from "@/lib/geo"
import { matchesViewUrl, type MatchesView } from "./matches-view"

// Same options as LocationPicker's "use my location" — battery-friendly fix,
// bounded wait; denial and timeout land in the same hint path.
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 60000,
}

/**
 * Sort switch for the matches hub (URL-driven — the server re-sorts).
 * "Nearest" needs a location: with none picked yet it starts the device
 * location flow directly, so the URL never claims a near sort it cannot
 * deliver. A tap on the matches map is the other way to set the location.
 */
export function MatchesSortControls({ view }: { view: MatchesView }) {
  const router = useRouter()
  const { t } = useI18n()
  const [geoPending, setGeoPending] = useState(false)
  const [geoDenied, setGeoDenied] = useState(false)
  // A denied prompt or a slow GPS must not setState into an unmounted tree.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  function navigate(view: MatchesView) {
    router.push(matchesViewUrl(view))
  }

  function locateAndSort() {
    if (geoPending) return
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    setGeoDenied(false)
    setGeoPending(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!aliveRef.current) return
        setGeoPending(false)
        navigate({
          sort: "near",
          coords: roundCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        })
      },
      () => {
        if (!aliveRef.current) return
        setGeoPending(false)
        setGeoDenied(true)
      },
      GEO_OPTIONS
    )
  }

  const nearActive = view.sort === "near"

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={t("matches.sortAria")}
          className="flex items-center gap-1.5"
        >
          <Button
            variant={nearActive ? "outline" : "default"}
            aria-pressed={!nearActive}
            onClick={() => navigate({ sort: "time", coords: view.coords })}
          >
            <ArrowDownWideNarrowIcon aria-hidden />
            {t("matches.sortSoonest")}
          </Button>
          <Button
            variant={nearActive ? "default" : "outline"}
            aria-pressed={nearActive}
            loading={geoPending}
            onClick={() =>
              view.coords
                ? navigate({ sort: "near", coords: view.coords })
                : locateAndSort()
            }
          >
            <MapPinIcon aria-hidden />
            {t("matches.sortNearest")}
          </Button>
        </div>
        {!view.coords ? (
          <Button
            variant="outline"
            loading={geoPending}
            onClick={locateAndSort}
          >
            <CrosshairIcon aria-hidden />
            {t("map.useMyLocation")}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => navigate({ sort: "time", coords: null })}>
            <XIcon aria-hidden />
            {t("matches.clearLocation")}
          </Button>
        )}
      </div>
      {geoDenied ? (
        <p aria-live="polite" className="text-xs text-dt-dim">
          {t("matches.locationDenied")}
        </p>
      ) : null}
    </div>
  )
}
