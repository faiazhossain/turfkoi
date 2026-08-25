"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"
import { primaryNav } from "./nav-data"
import { LinkPendingIndicator } from "./link-pending-indicator"

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

export function MainNav({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname()
  const { t } = useI18n()

  if (variant === "mobile") {
    return (
      <nav aria-label={t("common.primaryNavAria")} className="flex w-full items-stretch">
        {primaryNav.map((item) => {
          const active = isActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[0.625rem] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(item.labelKey)}
              <LinkPendingIndicator className="absolute top-0.5 right-1/4" />
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav aria-label={t("common.primaryNavAria")} className="ml-2 hidden items-center gap-1 md:flex">
      {primaryNav.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t(item.labelKey)}
            <LinkPendingIndicator />
          </Link>
        )
      })}
    </nav>
  )
}
