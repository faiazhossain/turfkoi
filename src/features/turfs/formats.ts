/**
 * Turf playing formats (5- through 11-a-side). Single source of truth for
 * dropdowns, display labels, and zod enums — client-safe (no db imports).
 * Keep values in sync with the `turf_format` Postgres enum (db/schema/enums).
 */
export const TURF_FORMATS = [
  { value: "fives", label: "5-a-side", short: "5v5" },
  { value: "sixes", label: "6-a-side", short: "6v6" },
  { value: "sevens", label: "7-a-side", short: "7v7" },
  { value: "eights", label: "8-a-side", short: "8v8" },
  { value: "nines", label: "9-a-side", short: "9v9" },
  { value: "tens", label: "10-a-side", short: "10v10" },
  { value: "elevens", label: "11-a-side", short: "11v11" },
] as const

export type TurfFormat = (typeof TURF_FORMATS)[number]["value"]

export const TURF_FORMAT_VALUES = TURF_FORMATS.map((f) => f.value) as [
  TurfFormat,
  ...TurfFormat[],
]

/** "fives" -> "5-a-side" (unknown values fall back to the raw value). */
export function turfFormatLabel(format: string): string {
  return TURF_FORMATS.find((f) => f.value === format)?.label ?? format
}

/** "fives" -> "5v5" — compact badge form. */
export function turfFormatShort(format: string): string {
  return TURF_FORMATS.find((f) => f.value === format)?.short ?? format
}

export function isTurfFormat(value: string): value is TurfFormat {
  return TURF_FORMATS.some((f) => f.value === value)
}
