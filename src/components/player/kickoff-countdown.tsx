"use client"

import { useEffect, useState } from "react"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"

/**
 * Live "starts in…" countdown for an upcoming kickoff. Ticks every second,
 * renders nothing once the time has passed (and nothing on the server pass —
 * time-dependent text is client-only to avoid hydration drift).
 */
export function KickoffCountdown({ kickoffMs }: { kickoffMs: number }) {
  const { t, locale } = useI18n()
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    // First tick is deferred (rAF, not sync) — a synchronous setState here
    // would trigger cascading renders (react-hooks rule).
    const raf = requestAnimationFrame(() => setNow(Date.now()))
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(id)
    }
  }, [])

  if (now === null) return null
  const diff = kickoffMs - now
  if (diff <= 0) return null

  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60

  const unit = (count: number, key: string, enWord: string) =>
    locale === "bn"
      ? `${count} ${t(key)}`
      : `${count} ${count === 1 ? enWord : `${enWord}s`}`

  const parts: string[] = []
  if (days) parts.push(unit(days, "countdown.days", "day"))
  if (hours) parts.push(unit(hours, "countdown.hours", "hour"))
  if (mins) parts.push(unit(mins, "countdown.minutes", "min"))
  if (secs) parts.push(unit(secs, "countdown.seconds", "sec"))

  const text = parts.join(" ")
  return (
    <p
      className="match-score text-xs font-bold text-dt-green"
      role="timer"
      aria-label={locale === "bn" ? text : `starts in ${text}`}
    >
      {locale === "bn" ? toBnDigits(text) : text} {t("countdown.suffix")}
    </p>
  )
}
