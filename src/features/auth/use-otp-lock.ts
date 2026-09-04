"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Client-side countdown for an OTP lockout. `start(seconds)` begins the
 * countdown from the server-provided `retryAfterSeconds`; while it runs the
 * callers disable the code input and submit/resend controls, and when it
 * reaches 0 everything re-enables. The interval is cleared on unmount.
 */
export function useOtpLock() {
  const [lockedUntil, setLockedUntil] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!lockedUntil) return
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  const start = useCallback((seconds: number) => {
    setLockedUntil(Date.now() + seconds * 1000)
  }, [])

  return { locked: secondsLeft > 0, secondsLeft, start }
}

/** mm:ss with locale digits (Bangla numerals where natural, e.g. ১৪:০৭). */
export function formatLockCountdown(seconds: number, locale: string): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  const digits = new Intl.NumberFormat(locale === "bn" ? "bn" : "en", {
    useGrouping: false,
  })
  const pad = (n: number) => digits.format(n).padStart(2, digits.format(0))
  return `${pad(minutes)}:${pad(secs)}`
}
