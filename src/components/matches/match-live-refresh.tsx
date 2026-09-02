"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Lightweight realtime for the live match room: soft-refresh the server
 * components on an interval so viewers see new log events without reloading.
 * Rendered by the page ONLY while the match is ongoing — once the state
 * leaves ongoing, a refresh unmounts this and the polling stops. Background
 * tabs don't hammer the server.
 */
export function MatchLiveRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
