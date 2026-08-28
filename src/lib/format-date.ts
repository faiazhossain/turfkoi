import { formatDistanceToNow } from "date-fns"
import { bn, enUS } from "date-fns/locale"

import type { Locale } from "@/i18n/config"

/**
 * Locale-aware date helpers for human-facing dates.
 *
 * Machine formats (slot expansion, DB keys) stay on en-CA YYYY-MM-DD in
 * their own modules — do not route them through here.
 */

const dateFnsLocale = (locale: Locale) => (locale === "bn" ? bn : enUS)

/**
 * `formatDistanceToNow` with the date-fns locale for the active UI locale
 * (e.g. "৫ মিনিট আগে" vs "5 minutes ago").
 */
export function formatDistanceToNowIn(
  date: Date | number,
  locale: Locale,
  options: { addSuffix?: boolean; includeSeconds?: boolean } = {}
) {
  return formatDistanceToNow(date, { ...options, locale: dateFnsLocale(locale) })
}

/**
 * BCP-47 tag for human-displayed dates. bn gets bn-BD (Bangla digits and
 * month names); en stays on en-CA, matching the app's existing date style.
 */
export function humanDateLocale(locale: Locale): string {
  return locale === "bn" ? "bn-BD" : "en-CA"
}

/**
 * Short human date from a YYYY-MM-DD slot date: "Mon, January 5" /
 * "সোম, জানুয়ারি ৫". Full month name — BN abbreviations like "সেপ" read
 * as confusing. Parses the ISO parts directly to avoid UTC shift.
 */
export function formatSlotDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(humanDateLocale(locale), {
    weekday: "short",
    month: "long",
    day: "numeric",
  }).format(new Date(y, m - 1, d))
}

function formatIso(
  iso: string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions
): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(humanDateLocale(locale), opts).format(
    new Date(y, m - 1, d)
  )
}

/**
 * Human date range from two YYYY-MM-DD strings: "January 30 – February 28,
 * 2027" / "৩০ জানুয়ারি–২৮ ফেব্রুয়ারি ২০২৭". When both ends share a year it
 * is shown once, at the end.
 */
export function formatDateRange(
  from: string,
  to: string,
  locale: Locale
): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const dayMonth = { day: "numeric", month: "long" } as const
  if (sameYear) {
    return `${formatIso(from, locale, dayMonth)}–${formatIso(to, locale, {
      ...dayMonth,
      year: "numeric",
    })}`
  }
  const full = { day: "numeric", month: "long", year: "numeric" } as const
  return `${formatIso(from, locale, full)}–${formatIso(to, locale, full)}`
}

/** Single human date: "January 30, 2027" / "৩০ জানুয়ারি ২০২৭". */
export function formatDayMonthYear(iso: string, locale: Locale): string {
  return formatIso(iso, locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}
