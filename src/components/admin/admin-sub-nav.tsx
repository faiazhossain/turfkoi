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
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/turfs", label: "Turfs", icon: MapPinIcon },
  { href: "/admin/applications", label: "Applications", icon: InboxIcon },
  { href: "/admin/teams", label: "Teams", icon: ShieldIcon },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarIcon },
  { href: "/admin/matches", label: "Matches", icon: SwordsIcon },
  { href: "/admin/transactions", label: "Transactions", icon: CreditCardIcon },
  { href: "/admin/reports", label: "Reports", icon: FlagIcon },
]

export function AdminSubNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Admin sections"
      className="-mx-4 mb-2 overflow-x-auto px-4 pb-2"
    >
      <ul className="flex min-w-max gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
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
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
