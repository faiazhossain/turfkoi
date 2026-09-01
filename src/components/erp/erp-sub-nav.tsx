"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"

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
            <p className="pb-1 pt-5 pl-3 text-[11px] font-medium uppercase tracking-wider text-dt-dim/60">
              {t(group.labelKey)}
            </p>
          ) : (
            gi > 0 && <div className="mt-5 border-t border-dt-line/60" />
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
                        ? "bg-dt-green/10 font-medium text-dt-green"
                        : "text-dt-dim hover:bg-dt-card2/60 hover:text-dt-txt"
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-dt-green"
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

/**
 * Mobile: a dropdown that looks and behaves exactly like the selects in the
 * ERP forms (same component, same affordance), so it reads as "pick a
 * section" — with a visible label and grouped options. Navigation happens
 * on selection.
 */
export function ErpMobileNav() {
  const { t } = useI18n()
  const router = useRouter()
  const activeHref = useActiveHref()
  const current = ALL_ITEMS.find((i) => i.href === activeHref) ?? ALL_ITEMS[0]
  const CurrentIcon = current.icon

  return (
    <nav aria-label={t("erp.navAria")} className="lg:hidden">
      <label className="mb-1.5 block text-xs font-medium text-dt-dim">
        {t("erp.nav.sectionPicker")}
      </label>
      <Select
        value={current.href}
        onValueChange={(href) => {
          if (href && href !== current.href) router.push(href)
        }}
      >
        <SelectTrigger className="h-11 w-full">
          <span className="flex items-center gap-2.5 text-sm font-medium">
            <CurrentIcon className="size-4 text-dt-green" aria-hidden />
            {t(current.labelKey)}
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-[70dvh]">
          {GROUPS.map((group, gi) => (
            <SelectGroup key={group.labelKey ?? `g${gi}`}>
              {group.labelKey ? (
                <SelectLabel>{t(group.labelKey)}</SelectLabel>
              ) : null}
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <SelectItem key={item.href} value={item.href}>
                    <span className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          "size-4",
                          item.href === activeHref ? "text-dt-green" : "text-dt-dim"
                        )}
                        aria-hidden
                      />
                      <span>{t(item.labelKey)}</span>
                    </span>
                  </SelectItem>
                )
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </nav>
  )
}

/** Kept for compatibility — renders the mobile dropdown (no scroll strip). */
export function ErpSubNav() {
  return <ErpMobileNav />
}
