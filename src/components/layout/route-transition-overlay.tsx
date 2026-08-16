"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { LoaderOverlay } from "@/components/ui/loader"

const SHOW_DELAY_MS = 200
const MAX_DISPLAY_MS = 15_000

/**
 * Full-screen route transition feedback. Next.js `loading.tsx` only covers
 * server streaming and is skipped entirely for prefetched/instant
 * navigations; this overlay guarantees visible feedback whenever a link
 * click takes longer than SHOW_DELAY_MS to produce a new page.
 */
export function RouteTransitionOverlay() {
  const pathname = usePathname()
  const [visible, setVisible] = React.useState(false)
  const [prevPathname, setPrevPathname] = React.useState(pathname)
  const navigatingRef = React.useRef(false)
  const showTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = React.useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current)
    if (safetyTimer.current) clearTimeout(safetyTimer.current)
    showTimer.current = null
    safetyTimer.current = null
  }, [])

  // Navigation completed: reset state during render (avoids effect cascades).
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    if (visible) setVisible(false)
  }

  // Navigation completed: cancel pending timers.
  React.useEffect(() => {
    navigatingRef.current = false
    clearTimers()
  }, [pathname, clearTimers])

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return
      }
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      // Search-only changes (filters) don't change the pathname; those are
      // covered by `loading.tsx` streaming and would never fire the effect
      // below, so ignore them to avoid a stuck overlay.
      if (url.pathname === window.location.pathname) return

      navigatingRef.current = true
      clearTimers()
      showTimer.current = setTimeout(() => {
        if (!navigatingRef.current) return
        setVisible(true)
        // Guaranteed exit path if navigation never completes.
        safetyTimer.current = setTimeout(() => setVisible(false), MAX_DISPLAY_MS)
      }, SHOW_DELAY_MS)
    }

    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      clearTimers()
    }
  }, [clearTimers])

  if (!visible) return null
  return <LoaderOverlay />
}
