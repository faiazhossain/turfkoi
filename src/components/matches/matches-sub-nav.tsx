import Link from "next/link"

import { getT } from "@/i18n/server"
import { cn } from "@/lib/utils"

/**
 * Two-tab strip shared by the matches hub and the logs page. Server-rendered
 * with an explicit `active` prop — no client JS, unlike AdminSubNav.
 */
export async function MatchesSubNav({ active }: { active: "open" | "logs" }) {
  const t = await getT()
  const items = [
    { key: "open" as const, href: "/matches", label: t("matches.tabOpen") },
    { key: "logs" as const, href: "/matches/logs", label: t("matches.tabLogs") },
  ]
  return (
    <nav aria-label={t("matches.navAria")}>
      <ul className="flex gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors",
                active === item.key
                  ? "border-dt-line bg-dt-card2 text-dt-txt"
                  : "border-transparent text-dt-dim hover:bg-dt-card2/50 hover:text-dt-txt"
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
