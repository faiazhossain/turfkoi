import { redirect } from "next/navigation"
import { TrendingUpIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { KpiTile } from "@/components/turfs"
import { AddIncomeSheet, MonthNav, VoidIncomeButton } from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { formatSlotDate } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

import { monthOfDate, monthRange } from "@/features/erp/finance"
import {
  getBookingRevenue,
  getBookingRevenueByDay,
  getOtherIncomeTotal,
  listOtherIncome,
} from "@/features/erp/queries"

export default async function ErpIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const [t, locale, params] = await Promise.all([getT(), getLocale(), searchParams])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(todayInDhaka())
  const { from, to } = monthRange(month)

  const [booking, otherIncomeList, otherTotal] = await Promise.all([
    getBookingRevenue(user.id, from, to),
    listOtherIncome(user.id, from, to),
    getOtherIncomeTotal(user.id, from, to),
  ])

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} basePath="/turf-owner/erp/income" />
        <AddIncomeSheet today={todayInDhaka()} />
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <KpiTile
          label={t("erp.income.bookingRevenue")}
          value={formatBdt(Math.round(booking.revenue))}
          hint={t("erp.income.bookingRevenueHint")}
        />
        <KpiTile
          label={t("erp.income.otherIncome")}
          value={formatBdt(Math.round(otherTotal))}
          hint={t("erp.income.otherIncomeHint")}
        />
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.income.daily")}
        </h2>
        <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
          <li className="flex items-center justify-between px-4 py-2.5 text-xs font-medium uppercase text-dt-dim">
            <span>{t("erp.income.form.date")}</span>
            <span>{t("erp.income.bookingRevenue")}</span>
          </li>
          <DayRows ownerId={user.id} from={from} to={to} locale={locale} />
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold">
            {t("erp.income.otherIncome")}
          </h2>
        </div>
        {otherIncomeList.length === 0 ? (
          <EmptyState
            icon={TrendingUpIcon}
            title={t("erp.income.empty")}
            description={t("erp.income.emptyBody")}
          />
        ) : (
          <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
            {otherIncomeList.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {t(`erp.income.sources.${r.source}`)}
                  </p>
                  <p className="text-xs text-dt-dim">
                    {formatSlotDate(r.date, locale)}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatBdt(Number(r.amount))}
                  </span>
                  <VoidIncomeButton id={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Booking income rows — aggregated in SQL, never fetched to the client. */
async function DayRows({
  ownerId,
  from,
  to,
  locale,
}: {
  ownerId: string
  from: string
  to: string
  locale: Awaited<ReturnType<typeof getLocale>>
}) {
  const t = await getT()
  const days = await getBookingRevenueByDay(ownerId, from, to)
  if (days.length === 0) {
    return (
      <li className="px-4 py-3 text-sm text-dt-dim">
        {t("erp.overview.noAlerts")}
      </li>
    )
  }
  return (
    <>
      {days.map((d) => (
        <li key={d.date} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span>{formatSlotDate(d.date, locale)}</span>
          <span className="tabular-nums">{formatBdt(Number(d.revenue))}</span>
        </li>
      ))}
    </>
  )
}
