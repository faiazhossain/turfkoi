import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import {
  addMonthsToMonth,
  monthOfDate,
} from "@/features/erp/finance"
import { todayInDhaka } from "@/lib/slot-expansion"
import { humanDateLocale } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

/** Server-rendered ‹ month › pager — `?month=YYYY-MM` drives every ERP page. */
export async function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const current = monthOfDate(todayInDhaka())
  const prev = addMonthsToMonth(month, -1)
  const next = addMonthsToMonth(month, 1)
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
    humanDateLocale(locale),
    { month: "long", year: "numeric", timeZone: "UTC" }
  )

  return (
    <div className="flex items-center gap-1" aria-label={t("erp.common.month")}>
      <Link
        href={`${basePath}?month=${prev}`}
        aria-label={t("erp.common.prevMonth")}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
      </Link>
      <span className="min-w-36 text-center font-heading text-sm font-semibold">
        {label}
      </span>
      <Link
        href={`${basePath}?month=${next}`}
        aria-label={t("erp.common.nextMonth")}
        aria-disabled={month === current}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted/50 hover:text-foreground ${
          month === current ? "pointer-events-none opacity-40" : "text-muted-foreground"
        }`}
      >
        <ChevronRightIcon className="size-4" aria-hidden />
      </Link>
    </div>
  )
}
