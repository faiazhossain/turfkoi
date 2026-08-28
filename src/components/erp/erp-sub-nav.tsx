"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboardIcon,
  TrendingUpIcon,
  WalletIcon,
  PiggyBankIcon,
  UsersIcon,
  BanknoteIcon,
  ReceiptTextIcon,
  WrenchIcon,
  ChartColumnBigIcon,
  TargetIcon,
  SparklesIcon,
  FileTextIcon,
  SettingsIcon,
  ChevronDownIcon,
  CheckIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

/**
 * ERP navigation, designed the way premium SaaS products do it (Stripe /
 * Linear pattern): a grouped, intent-labeled sidebar on desktop instead of
 * one long scrolling strip, and a compact "current page" selector that opens
 * a grouped menu on mobile (UX guideline: 5–7 items max before grouping
 * becomes necessary; group by user intent).
 */
const GROUPS: {
  labelKey: string | null
  items: { href: string; labelKey: string; icon: typeof LayoutDashboardIcon }[]
}[] = [
  {
    labelKey: null,
    items: [
      { href: "/turf-owner/erp", labelKey: "erp.nav.overview", icon: LayoutDashboardIcon },
    ],
  },
  {
    labelKey: "erp.navGroups.money",
    items: [
      { href: "/turf-owner/erp/income", labelKey: "erp.nav.income", icon: TrendingUpIcon },
      { href: "/turf-owner/erp/expenses", labelKey: "erp.nav.expenses", icon: WalletIcon },
      { href: "/turf-owner/erp/profit", labelKey: "erp.nav.profit", icon: PiggyBankIcon },
    ],
  },
  {
    labelKey: "erp.navGroups.people",
    items: [
      { href: "/turf-owner/erp/staff", labelKey: "erp.nav.staff", icon: UsersIcon },
      { href: "/turf-owner/erp/staff/salaries", labelKey: "erp.nav.salaries", icon: BanknoteIcon },
    ],
  },
  {
    labelKey: "erp.navGroups.operations",
    items: [
      { href: "/turf-owner/erp/bills", labelKey: "erp.nav.bills", icon: ReceiptTextIcon },
      { href: "/turf-owner/erp/maintenance", labelKey: "erp.nav.maintenance", icon: WrenchIcon },
    ],
  },
  {
    labelKey: "erp.navGroups.insight",
    items: [
      { href: "/turf-owner/erp/analytics", labelKey: "erp.nav.analytics", icon: ChartColumnBigIcon },
      { href: "/turf-owner/erp/goals", labelKey: "erp.nav.goals", icon: TargetIcon },
      { href: "/turf-owner/erp/assistant", labelKey: "erp.nav.assistant", icon: SparklesIcon },
    ],
  },
  {
    labelKey: "erp.navGroups.more",
    items: [
      { href: "/turf-owner/erp/reports", labelKey: "erp.nav.reports", icon: FileTextIcon },
      { href: "/turf-owner/erp/settings", labelKey: "erp.nav.settings", icon: SettingsIcon },
    ],
  },
]

const ALL_ITEMS = GROUPS.flatMap((g) => g.items)

function useActiveHref(): string | null {
  const pathname = usePathname()
  // Most specific match wins: /staff/salaries highlights only Salaries,
  // while plain /staff highlights Staff.
  const matches = ALL_ITEMS.filter(
    (item) =>
      pathname === item.href ||
      (pathname?.startsWith(item.href + "/") ?? false)
  )
  if (matches.length === 0) return null
  return matches.sort((a, b) => b.href.length - a.href.length)[0].href
}

/** Desktop: grouped sticky sidebar (hidden below lg). */
export function ErpSidebarNav() {
  const { t } = useI18n()
  const activeHref = useActiveHref()

  return (
    <nav aria-label={t("erp.navAria")} className="hidden lg:block">
      {GROUPS.map((group, gi) => (
        <div key={group.labelKey ?? `g${gi}`}>
          {group.labelKey ? (
            <p className="pb-1 pt-5 pl-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {t(group.labelKey)}
            </p>
          ) : (
            gi > 0 && <div className="mt-5 border-t border-border/60" />
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                      />
                    ) : null}
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Mobile: current-page selector that opens the grouped menu in a sheet. */
export function ErpMobileNav() {
  const { t } = useI18n()
  const activeHref = useActiveHref()
  const [open, setOpen] = useState(false)
  const current = ALL_ITEMS.find((i) => i.href === activeHref) ?? ALL_ITEMS[0]
  const CurrentIcon = current.icon

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              aria-label={t("erp.navAria")}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2.5">
                <CurrentIcon className="size-4 text-primary" aria-hidden />
                {t(current.labelKey)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {t("erp.nav.menu")}
                <ChevronDownIcon className="size-4" aria-hidden />
              </span>
            </button>
          }
        />
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-2xl px-5 pb-8 pt-4"
        >
          <SheetHeader className="p-0 pb-2">
            <SheetTitle className="font-heading text-base font-semibold">
              {t("erp.title")}
            </SheetTitle>
          </SheetHeader>
          <nav aria-label={t("erp.navAria")}>
            {GROUPS.map((group, gi) => (
              <div key={group.labelKey ?? `g${gi}`}>
                {group.labelKey ? (
                  <p className="pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {t(group.labelKey)}
                  </p>
                ) : (
                  gi > 0 && <div className="mt-4 border-t border-border/60" />
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.href === activeHref
                    const Icon = item.icon
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-11 items-center justify-between rounded-lg px-3 text-sm transition-colors",
                            active
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {t(item.labelKey)}
                          </span>
                          {active ? <CheckIcon className="size-4" aria-hidden /> : null}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** Kept for compatibility — renders the mobile selector (no scroll strip). */
export function ErpSubNav() {
  return <ErpMobileNav />
}
