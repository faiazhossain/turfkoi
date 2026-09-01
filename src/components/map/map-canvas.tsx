"use client"

import { useEffect, useRef, useState } from "react"
import type { Map as MLMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { Loader } from "@/components/ui/loader"
import { useI18n } from "@/i18n/client"
import { MAP_TILES_URL } from "@/lib/map"
import { cn } from "@/lib/utils"

/** Dhaka city center — sane default initial view for a BD-first product. */
export const DHAKA_CENTER: [number, number] = [90.4125, 23.8103]

/**
 * Low-level MapLibre canvas. Owns the map instance lifecycle (create, load,
 * dispose) and exposes both via onReady so consumers can add markers, popups,
 * and interactions. Rendering: MapLibre GL; tiles: OpenFreeMap (src/lib/map).
 *
 * Shows the approved Loader while the style loads and a plain fallback on
 * tile failure — no competing spinner designs (CLAUDE.md loader rule).
 */
export function MapCanvas({
  center = DHAKA_CENTER,
  zoom = 12,
  className,
  onReady,
  ariaLabel = "Map",
  fullscreen = false,
}: {
  center?: [number, number]
  zoom?: number
  className?: string
  onReady?: (
    map: MLMap,
    maplibregl: typeof import("maplibre-gl")
  ) => void
  ariaLabel?: string
  fullscreen?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  // Capture initial view only — later prop changes are ignored by design.
  const initialView = useRef({ center, zoom })
  const onReadyRef = useRef(onReady)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    let map: MLMap | null = null
    let loaded = false

    import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !containerRef.current) return
        // v6 resolves its worker relative to import.meta.url, which bundlers
        // (Turbopack/webpack) break — point it at the copy in public/.
        if (!maplibregl.config.WORKER_URL) {
          maplibregl.config.WORKER_URL = "/maplibre-gl-worker.mjs"
        }
        map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_TILES_URL,
          center: initialView.current.center,
          zoom: initialView.current.zoom,
          attributionControl: false,
        })
        if (fullscreen) {
          map.addControl(
            new maplibregl.FullscreenControl(),
            "top-right"
          )
        }
        map.on("load", () => {
          if (disposed) return
          loaded = true
          setReady(true)
          onReadyRef.current?.(map!, maplibregl)
        })
        map.on("error", () => {
          // Only surface a hard failure when the style never loaded.
          if (!disposed && !loaded) setFailed(true)
        })
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
      map?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className={cn(
        "relative h-64 w-full overflow-hidden rounded-lg border border-dt-line fullscreen:rounded-none fullscreen:border-none",
        className
      )}
    >
      {!ready && !failed ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-dt-card2/60">
          <Loader size={96} className="max-h-24 max-w-24" label={t("map.loading")} />
        </div>
      ) : null}
      {failed ? (
        <div
          role="status"
          className="absolute inset-0 z-10 flex items-center justify-center bg-dt-card2/80 p-4 text-center text-sm text-dt-dim"
        >
          {t("map.loadFailed")}
        </div>
      ) : null}
    </div>
  )
}
