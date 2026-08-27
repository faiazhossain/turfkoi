import type { Locale } from "@/i18n/config"

/**
 * Locale-aware display of "HH:MM" slot times. Machine formats (DB, slot
 * expansion, form values) stay 24h "HH:MM" — only render through here.
 *
 * en: 12-hour clock with AM/PM ("5:00 PM – 11:00 PM").
 * bn: Bangla day part + Bangla digits ("বিকাল ৫:০০ – রাত ১১:০০").
 */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"]

/** Convert Western digits in a string to Bangla digits (8 → ৮). */
export function toBnDigits(s: string): string {
  return s.replace(/\d/g, (d) => BN_DIGITS[Number(d)])
}

/** রাত 18:00–03:59 · সকাল 04:00–11:59 · দুপুর 12:00–15:59 · বিকাল 16:00–17:59 */
function bnDayPart(hour: number): string {
  if (hour >= 4 && hour < 12) return "সকাল"
  if (hour >= 12 && hour < 16) return "দুপুর"
  if (hour >= 16 && hour < 18) return "বিকাল"
  return "রাত"
}

function to12(hour: number): number {
  return hour % 12 === 0 ? 12 : hour % 12
}

export function formatSlotTime(hhmm: string, locale: Locale): string {
  const [h, m] = hhmm.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const mm = String(m).padStart(2, "0")
  if (locale === "bn") {
    return `${bnDayPart(h)} ${toBnDigits(`${to12(h)}:${mm}`)}`
  }
  return `${to12(h)}:${mm} ${h >= 12 ? "PM" : "AM"}`
}

/**
 * Range with the suffix/part shown once when both ends share it:
 * "5:00 – 11:00 PM" / "বিকাল ৫:০০ – রাত ১১:০০" (shared: "বিকাল ৫:০০ – ৬:৩০").
 */
export function formatSlotTimeRange(
  from: string,
  to: string,
  locale: Locale
): string {
  const [fh, fm] = from.split(":").map(Number)
  const [th, tm] = to.split(":").map(Number)
  if (![fh, fm, th, tm].every(Number.isFinite)) return `${from}–${to}`
  const mmF = String(fm).padStart(2, "0")
  const mmT = String(tm).padStart(2, "0")
  if (locale === "bn") {
    const partF = bnDayPart(fh)
    const partT = bnDayPart(th)
    const tail = toBnDigits(`${to12(th)}:${mmT}`)
    return partF === partT
      ? `${partF} ${toBnDigits(`${to12(fh)}:${mmF}`)} – ${tail}`
      : `${partF} ${toBnDigits(`${to12(fh)}:${mmF}`)} – ${partT} ${tail}`
  }
  const ampm = th >= 12 ? "PM" : "AM"
  const sameHalf = Math.floor(fh / 12) === Math.floor(th / 12)
  return sameHalf
    ? `${to12(fh)}:${mmF} – ${to12(th)}:${mmT} ${ampm}`
    : `${formatSlotTime(from, locale)} – ${formatSlotTime(to, locale)}`
}
