"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import type { Locale } from "./config"
import { setLocale } from "./actions"
import { useI18n } from "./client"

/**
 * BN | EN navbar toggle. Accessible: native buttons in a labelled group,
 * active state via `aria-pressed` AND an underline (never color-only).
 * Switching persists the cookie server-side and refreshes the RSC tree.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, t } = useI18n()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const switchTo = (next: Locale) => {
    if (next === locale || pending) return
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  const item = (code: "BN" | "EN", next: Locale) => {
    const active = locale === next
    return (
      <button
        type="button"
        onClick={() => switchTo(next)}
        disabled={pending}
        aria-pressed={active}
        aria-label={active ? undefined : t("nav.language")}
        className={cn(
          "rounded px-1.5 py-0.5 leading-none transition-colors",
          active
            ? "bg-primary/15 font-semibold text-primary underline underline-offset-2"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        {code}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className={cn(
        "flex select-none items-center gap-0.5 rounded-md border border-border p-0.5 text-xs",
        pending && "opacity-60",
        className
      )}
    >
      {item("BN", "bn")}
      <span aria-hidden className="text-muted-foreground">
        |
      </span>
      {item("EN", "en")}
    </div>
  )
}
