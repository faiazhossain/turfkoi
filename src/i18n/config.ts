export const LOCALES = ["bn", "en"] as const

export type Locale = (typeof LOCALES)[number]

/** Bangla is the product default — every visitor starts here. */
export const DEFAULT_LOCALE: Locale = "bn"

export const LOCALE_COOKIE = "tk_locale"

/**
 * Resolve the active locale from the raw `tk_locale` cookie value.
 * Anything missing or unrecognized falls back to Bangla (never English).
 */
export function resolveLocale(cookieValue?: string | null): Locale {
  return cookieValue === "en" ? "en" : "bn"
}
