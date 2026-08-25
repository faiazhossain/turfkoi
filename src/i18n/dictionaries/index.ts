import type { Locale } from "../config"
import { bn } from "./bn"
import { en } from "./en"

const dictionaries = { bn, en } as const

/**
 * Plain module lookup — safe to import from both server and client code.
 * Client components import this directly; the locale itself always comes
 * from the server render (cookie) so SSR and hydration agree.
 */
export function getDictionary(locale: Locale) {
  return dictionaries[locale]
}

export type { Dictionary } from "./en"
