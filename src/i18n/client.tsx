"use client"

import * as React from "react"

import type { Locale } from "./config"
import { getDictionary } from "./dictionaries"
import { translate, type TranslateParams, type Translator } from "./translate"

interface I18nContextValue {
  locale: Locale
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

/**
 * Receives the locale resolved on the server (cookie) so SSR and
 * hydration render the same language. Never read navigator.language
 * or localStorage — the cookie + router.refresh() is the only switch path.
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const value = React.useMemo(() => ({ locale }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): { locale: Locale; t: Translator } {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>")
  const dict = getDictionary(ctx.locale)
  const t = React.useCallback<Translator>(
    (key, params) => translate(dict, key, params),
    // Dictionary identity is stable per locale module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.locale]
  )
  return { locale: ctx.locale, t }
}

/**
 * Action error shape during the i18n migration. Migrated actions return
 * `{ key, params? }`; legacy actions still return raw English strings,
 * which `t()` passes through untouched (unknown key → key itself).
 */
export type ActionError = string | { key: string; params?: TranslateParams }

/** Render a server-action error through the translator. */
export function translateError(err: ActionError | undefined, t: Translator): string {
  if (typeof err === "object" && err !== null) return t(err.key, err.params)
  return t(err ?? "errors.generic")
}

/**
 * Render a Zod/form field error. Migrated schemas use dictionary keys as
 * messages; legacy English messages pass through unchanged.
 */
export function fieldError(message: string | undefined, t: Translator): string {
  return message ? t(message) : ""
}
