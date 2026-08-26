/**
 * Wizard → schedule-sections compiler (schedule setup wizard).
 *
 * The wizard asks owner-sized questions (open hours, peak pricing, one break)
 * and this pure module compiles them into the section list the schedule
 * system already understands. Time math mirrors slot-expansion's contract:
 * naive minutes (BD has no DST) and endTime <= startTime meaning a window
 * that wraps past midnight.
 */

import {
  MINUTES_PER_DAY,
  toHHMM,
  toMinutes,
  type ScheduleSection,
} from "@/lib/slot-expansion"

/**
 * A section as accepted by the save-schedule schema: label optional, never
 * null (ScheduleSection's broader null is for DB rows).
 */
export type WizardSection = Omit<ScheduleSection, "label"> & {
  label?: string
}

export interface WizardValues {
  pricing: "flat" | "peak"
  /** Used when pricing = "flat". */
  flatPrice: number
  /** Peak window (same every day). Used when pricing = "peak". */
  peakFrom: string
  peakTo: string
  peakPrice: number
  offPeakPrice: number
  /** Daily open hours. openTo <= openFrom means wrapping past midnight. */
  openFrom: string
  openTo: string
  slotMinutes: number
  gapMinutes: number
  breakEnabled: boolean
  breakFrom: string
  breakTo: string
  /** Days (0 = Sunday) the break applies to. */
  breakDays: number[]
}

type Range = [number, number]

function toRange(from: string, to: string): Range {
  const s = toMinutes(from)
  let e = toMinutes(to)
  if (e <= s) e += MINUTES_PER_DAY
  return [s, e]
}

function overlapLen(a: Range, b: Range): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))
}

/**
 * Place a wrap-adjusted window (e.g. a peak 17:00–23:00 or a break) in the
 * day--relative frame of the open window, trying ±24h placements so a
 * wrapping open window (Ramadan 20:00–02:00) still matches its peak/break.
 */
function nearRange(w: Range, open: Range): Range {
  let best = w
  let bestOverlap = overlapLen(w, open)
  for (const shift of [-MINUTES_PER_DAY, MINUTES_PER_DAY]) {
    const candidate: Range = [w[0] + shift, w[1] + shift]
    const o = overlapLen(candidate, open)
    if (o > bestOverlap) {
      best = candidate
      bestOverlap = o
    }
  }
  return best
}

function subtractCut(window: Range, cut: Range): Range[] {
  const cutStart = Math.max(window[0], cut[0])
  const cutEnd = Math.min(window[1], cut[1])
  if (cutEnd <= cutStart) return [window]
  const out: Range[] = []
  if (window[0] < cutStart) out.push([window[0], cutStart])
  if (cutEnd < window[1]) out.push([cutEnd, window[1]])
  return out
}

/** Split an open window by the peak window into peak/off-peak segments. */
function splitByPeak(
  window: Range,
  peak: Range
): { range: Range; peak: boolean }[] {
  const segments: { range: Range; peak: boolean }[] = []
  const off1: Range = [window[0], Math.min(window[1], peak[0])]
  const inPeak: Range = [Math.max(window[0], peak[0]), Math.min(window[1], peak[1])]
  const off2: Range = [Math.max(window[0], peak[1]), window[1]]
  if (off1[1] > off1[0]) segments.push({ range: off1, peak: false })
  if (inPeak[1] > inPeak[0]) segments.push({ range: inPeak, peak: true })
  if (off2[1] > off2[0]) segments.push({ range: off2, peak: false })
  return segments
}

function toSection(
  day: number,
  label: string | undefined,
  [start, end]: Range,
  price: number,
  v: WizardValues
): WizardSection {
  return {
    dayOfWeek: day,
    label,
    // end may exceed 1440 (wrapped window); mod back. A wrapped section's
    // endTime then lands <= startTime, which is the system's wrap encoding.
    startTime: toHHMM(start % MINUTES_PER_DAY),
    endTime: toHHMM(end % MINUTES_PER_DAY),
    slotMinutes: v.slotMinutes,
    gapMinutes: v.gapMinutes,
    price,
  }
}

/**
 * Compile wizard answers into one section list for all 7 days. Empty days
 * (break covering everything) simply contribute no sections. The result is
 * non-overlapping by construction and passes findSectionConflicts.
 */
export function buildWizardSections(v: WizardValues): WizardSection[] {
  const open = toRange(v.openFrom, v.openTo)
  const sections: WizardSection[] = []

  const peak =
    v.pricing === "peak" ? nearRange(toRange(v.peakFrom, v.peakTo), open) : null

  for (let day = 0; day < 7; day++) {
    let windows: Range[] = [open]

    if (v.breakEnabled && v.breakDays.includes(day)) {
      const brk = nearRange(toRange(v.breakFrom, v.breakTo), open)
      windows = windows.flatMap((w) => subtractCut(w, brk))
    }

    for (const w of windows) {
      if (peak) {
        for (const seg of splitByPeak(w, peak)) {
          sections.push(
            toSection(
              day,
              seg.peak ? "Peak" : "Off-peak",
              seg.range,
              seg.peak ? v.peakPrice : v.offPeakPrice,
              v
            )
          )
        }
      } else if (w[1] > w[0]) {
        sections.push(toSection(day, undefined, w, v.flatPrice, v))
      }
    }
  }

  return sections
}
