import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"

import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config"
import { getDictionary } from "./dictionaries"
import { translate, type Translator } from "./translate"

/**
 * Per-request locale from the `tk_locale` cookie, defaulting to Bangla.
 * `cache()` dedupes within a request — never store locale at module scope
 * (it would leak across requests). Reading cookies marks routes dynamic,
 * which is already the case for this session-driven app.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies()
  return resolveLocale(jar.get(LOCALE_COOKIE)?.value)
})

/** Server-side translator for server components and generateMetadata. */
export async function getT(): Promise<Translator> {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  return (key, params) => translate(dict, key, params)
}
