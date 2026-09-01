"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboardIcon,
  UsersIcon,
  MapPinIcon,
  InboxIcon,
  ShieldIcon,
  CalendarIcon,
  SwordsIcon,
  CreditCardIcon,
  FlagIcon,
  BadgeCheckIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"

const NAV = [
  { href: "/admin", labelKey: "admin.sections.overview", icon: LayoutDashboardIcon },
  { href: "/admin/users", labelKey: "admin.sections.users", icon: UsersIcon },
  { href: "/admin/turfs", labelKey: "admin.sections.turfs", icon: MapPinIcon },
  { href: "/admin/applications", labelKey: "admin.sections.applications", icon: InboxIcon },
  { href: "/admin/teams", labelKey: "admin.sections.teams", icon: ShieldIcon },
  { href: "/admin/bookings", labelKey: "admin.sections.bookings", icon: CalendarIcon },
  { href: "/admin/matches", labelKey: "admin.sections.matches", icon: SwordsIcon },
  { href: "/admin/transactions", labelKey: "admin.sections.transactions", icon: CreditCardIcon },
  { href: "/admin/reports", labelKey: "admin.sections.reports", icon: FlagIcon },
  { href: "/admin/erp-premium", labelKey: "admin.sections.erpPremium", icon: BadgeCheckIcon },
]

export function AdminSubNav({
  pendingApplications = 0,
  pendingPremiumRequests = 0,
}: {
  pendingApplications?: number
  pendingPremiumRequests?: number
}) {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <nav
      aria-label={t("admin.navAria")}
      className="-mx-4 mb-2 overflow-x-auto px-4 pb-2"
    >
      <ul className="flex min-w-max gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname?.startsWith(item.href)
          const Icon = item.icon
          const badge =
            item.href === "/admin/applications" && pendingApplications > 0
              ? pendingApplications > 9
                ? "9+"
                : String(pendingApplications)
              : item.href === "/admin/erp-premium" && pendingPremiumRequests > 0
                ? pendingPremiumRequests > 9
                  ? "9+"
                  : String(pendingPremiumRequests)
                : null
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-dt-line bg-dt-card2 text-dt-txt"
                    : "border-transparent text-dt-dim hover:bg-dt-card2/50 hover:text-dt-txt"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(item.labelKey)}
                {badge ? (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-dt-green px-1 text-[10px] leading-none font-semibold text-dt-ink">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
