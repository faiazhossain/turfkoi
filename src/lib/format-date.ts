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
 * Short human date from a YYYY-MM-DD slot date: "Mon, Jan 5" /
 * "সোম, জানু ৫". Parses the ISO parts directly to avoid UTC shift.
 */
export function formatSlotDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(humanDateLocale(locale), {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d))
}
