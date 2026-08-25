"use server"

import { cookies } from "next/headers"

import { LOCALE_COOKIE, type Locale } from "./config"

/**
 * Persist the language preference. Cookie writes are only legal in
 * Server Actions / Route Handlers; callers pair this with
 * `router.refresh()` so the whole RSC tree (including <html lang> and
 * metadata) re-renders in the new locale without a hard reload.
 */
export async function setLocale(next: Locale) {
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
}
