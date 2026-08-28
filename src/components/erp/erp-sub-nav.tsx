"use client"

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
  SettingsIcon,
  ChartColumnBigIcon,
  TargetIcon,
  SparklesIcon,
  FileTextIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"

const NAV = [
  { href: "/turf-owner/erp", labelKey: "erp.nav.overview", icon: LayoutDashboardIcon },
  { href: "/turf-owner/erp/income", labelKey: "erp.nav.income", icon: TrendingUpIcon },
  { href: "/turf-owner/erp/expenses", labelKey: "erp.nav.expenses", icon: WalletIcon },
  { href: "/turf-owner/erp/profit", labelKey: "erp.nav.profit", icon: PiggyBankIcon },
  { href: "/turf-owner/erp/staff", labelKey: "erp.nav.staff", icon: UsersIcon },
  { href: "/turf-owner/erp/staff/salaries", labelKey: "erp.nav.salaries", icon: BanknoteIcon },
  { href: "/turf-owner/erp/bills", labelKey: "erp.nav.bills", icon: ReceiptTextIcon },
  { href: "/turf-owner/erp/maintenance", labelKey: "erp.nav.maintenance", icon: WrenchIcon },
  { href: "/turf-owner/erp/analytics", labelKey: "erp.nav.analytics", icon: ChartColumnBigIcon },
  { href: "/turf-owner/erp/goals", labelKey: "erp.nav.goals", icon: TargetIcon },
  { href: "/turf-owner/erp/assistant", labelKey: "erp.nav.assistant", icon: SparklesIcon },
  { href: "/turf-owner/erp/reports", labelKey: "erp.nav.reports", icon: FileTextIcon },
  { href: "/turf-owner/erp/settings", labelKey: "erp.nav.settings", icon: SettingsIcon },
]

export function ErpSubNav() {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <nav
      aria-label={t("erp.navAria")}
      className="-mx-4 mb-2 overflow-x-auto px-4 pb-2"
    >
      <ul className="flex min-w-max gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/turf-owner/erp"
              ? pathname === "/turf-owner/erp"
              : pathname?.startsWith(item.href)
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
