import Link from "next/link"
import { redirect } from "next/navigation"
import { ChartColumnBigIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { MonthNav } from "@/components/erp"
import { PremiumBadge, PremiumLockCard } from "@/components/erp/premium-lock-card"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"
import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"

import {
  lastMonths,
  monthOfDate,
  monthRange,
} from "@/features/erp/finance"
import {
  getCustomerStats,
  getExpenseTrend,
  getForecast,
  getRevenueByHour,
  getRevenueByWeekday,
  getRevenueTrend,
  getTurfComparison,
} from "@/features/erp/analytics"
import { getSalaryMonth } from "@/features/erp/queries"

export default async function ErpAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const t = await getT()
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const plan = getErpPlanState(await ensureErpProfile(user.id))
  if (!plan.isPremiumFeaturesUnlocked) {
    return (
      <div className="mt-4 space-y-4">
        <PremiumLockCard
          titleKey="erp.analytics.lockedTitle"
          descKey="erp.analytics.lockedDesc"
        />
      </div>
    )
  }

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(todayInDhaka())
  const { from, to } = monthRange(month)
  const trendMonths = lastMonths(month, 6)

  const [revTrend, expTrend, weekday, hours, turfs, customers, salaryRows, forecast] =
    await Promise.all([
      getRevenueTrend(user.id, trendMonths),
      getExpenseTrend(user.id, trendMonths),
      getRevenueByWeekday(user.id, from, to),
      getRevenueByHour(user.id, from, to),
      getTurfComparison(user.id, from, to),
      getCustomerStats(user.id, from, to),
      getSalaryMonth(user.id, month),
      getForecast(user.id, month),
    ])
  const staffCost = salaryRows.reduce((a, r) => a + r.paidAmount, 0)

  const maxRev = Math.max(1, ...revTrend.map((r) => r.revenue))
  const maxExp = Math.max(1, ...expTrend.map((r) => r.total))
  const bestDay = [...weekday].sort((a, b) => b.revenue - a.revenue)[0]
  const topHours = hours.slice(0, 3)
  const repeatPct =
    customers.totalCustomers === 0
      ? 0
      : Math.round((customers.repeatCustomers / customers.totalCustomers) * 100)

  function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
    return (
      <span className="h-2 w-full overflow-hidden rounded bg-dt-card2">
        <span
          className={`block h-full rounded ${tone}`}
          style={{ width: `${Math.round((value / max) * 100)}%` }}
        />
      </span>
    )
  }

  return (
    <div className="mt-4 space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <PremiumBadge />
        <MonthNav month={month} basePath="/turf-owner/erp/analytics" />
      </div>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.analytics.revenueTrend")}
        </h2>
        <ul className="space-y-2">
          {revTrend.map((r) => (
            <li key={r.month} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-dt-dim">{r.month}</span>
              <Bar value={r.revenue} max={maxRev} tone="bg-dt-green" />
              <span className="w-24 shrink-0 text-right tabular-nums">
                {formatBdt(Math.round(r.revenue))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.analytics.expenseTrend")}
        </h2>
        <ul className="space-y-2">
          {expTrend.map((r) => (
            <li key={r.month} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-dt-dim">{r.month}</span>
              <Bar value={r.total} max={maxExp} tone="bg-destructive/70" />
              <span className="w-24 shrink-0 text-right tabular-nums">
                {formatBdt(Math.round(r.total))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-dashed border-dt-line bg-dt-card/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">
            {t("erp.analytics.forecastTitle")}
          </h2>
          <span className="rounded bg-dt-card2 px-2 py-0.5 text-[10px] uppercase text-dt-dim">
            {t("erp.analytics.forecastBadge")}
          </span>
        </div>
        {!forecast.sufficient ? (
          <p className="mt-2 text-sm text-dt-dim">
            {t("erp.analytics.forecastNoData")}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {(
              [
                ["erp.analytics.forecastRevenue", forecast.revenue],
                ["erp.analytics.forecastExpenses", forecast.expenses],
                ["erp.analytics.forecastProfit", forecast.profit],
              ] as const
            ).map(([key, f]) => (
              <div key={key} className="rounded-lg border border-dt-line bg-dt-card px-3 py-3">
                <p className="text-xs text-dt-dim">{t(key)}</p>
                <p className="mt-1 font-heading text-lg font-semibold tabular-nums">
                  {f ? formatBdt(f.value) : "—"}
                </p>
                <p className="text-[10px] text-dt-dim">
                  {f ? f.nextMonth : ""}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-dt-dim">{t("erp.analytics.forecastHint")}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-dt-line bg-dt-card p-4">
          <p className="text-xs uppercase tracking-wide text-dt-dim">
            {t("erp.analytics.bestDay")}
          </p>
          <p className="mt-1 font-heading text-lg font-semibold">
            {bestDay ? t(`erp.weekdays.${bestDay.dow}`) : "—"}
          </p>
          {bestDay ? (
            <p className="text-sm text-dt-dim">
              {formatBdt(Math.round(bestDay.revenue))}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-dt-line bg-dt-card p-4">
          <p className="text-xs uppercase tracking-wide text-dt-dim">
            {t("erp.analytics.staffCost")}
          </p>
          <p className="mt-1 font-heading text-lg font-semibold tabular-nums">
            {formatBdt(Math.round(staffCost))}
          </p>
          <p className="text-sm text-dt-dim">{t("erp.analytics.staffCostHint")}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.analytics.peakHours")}
        </h2>
        {topHours.length === 0 ? (
          <EmptyState
            icon={ChartColumnBigIcon}
            title={t("erp.analytics.noData")}
            description={t("erp.analytics.noDataDesc")}
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-3">
            {topHours.map((h, i) => (
              <li key={h.hour} className="rounded-lg border border-dt-line bg-dt-card px-4 py-3">
                <p className="text-xs text-dt-dim">#{i + 1}</p>
                <p className="font-heading text-lg font-semibold tabular-nums">
                  {String(h.hour).padStart(2, "0")}:00
                </p>
                <p className="text-sm tabular-nums">{formatBdt(Math.round(h.revenue))}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.analytics.turfPerformance")}
        </h2>
        <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
          {turfs.map((tf) => (
            <li key={tf.turfId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{tf.turfName}</span>
              <span className="flex gap-4 tabular-nums">
                <span>
                  <span className="text-dt-dim">{t("erp.profit.lineBooking")}: </span>
                  {formatBdt(Math.round(tf.revenue))}
                </span>
                <span>
                  <span className="text-dt-dim">{t("erp.profit.lineExpenses")}: </span>
                  {formatBdt(Math.round(tf.expenses))}
                </span>
                <span className={tf.profit >= 0 ? "text-dt-green" : "text-destructive"}>
                  <span className="text-dt-dim">{t("erp.profit.lineNet")}: </span>
                  {formatBdt(Math.round(tf.profit))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.analytics.customers")}
        </h2>
        <div className="mb-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-dt-line bg-dt-card px-3 py-3">
            <p className="font-heading text-lg font-semibold">{customers.totalCustomers}</p>
            <p className="text-xs text-dt-dim">{t("erp.analytics.totalCustomers")}</p>
          </div>
          <div className="rounded-lg border border-dt-line bg-dt-card px-3 py-3">
            <p className="font-heading text-lg font-semibold">{repeatPct}%</p>
            <p className="text-xs text-dt-dim">{t("erp.analytics.repeatCustomers")}</p>
          </div>
          <div className="rounded-lg border border-dt-line bg-dt-card px-3 py-3">
            <p className="font-heading text-lg font-semibold">
              {customers.avgBookingsPerCustomer}
            </p>
            <p className="text-xs text-dt-dim">{t("erp.analytics.avgBookings")}</p>
          </div>
        </div>
        {customers.top.length > 0 ? (
          <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
            {customers.top.map((c) => (
              <li key={c.bookerId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{c.name}</span>
                <span className="flex gap-4">
                  <span className="text-dt-dim">
                    {t("erp.analytics.bookingsCount", { count: c.bookings })}
                  </span>
                  <span className="tabular-nums">{formatBdt(Math.round(c.revenue))}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
