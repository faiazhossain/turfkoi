import Link from "next/link"
import { redirect } from "next/navigation"
import { LockIcon, PiggyBankIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { KpiTile } from "@/components/turfs"
import { MonthNav } from "@/components/erp"
import { getCashFlowByDay } from "@/features/erp/analytics"
import { getT } from "@/i18n/server"
import { cn } from "@/lib/utils"

/** Server-rendered P&L ⇄ cash-flow switch (no client tabs needed). */
async function ViewToggle({ month, view }: { month: string; view: string }) {
  const t = await getT()
  const base = `/turf-owner/erp/profit?month=${month}&view=`
  return (
    <div className="flex overflow-hidden rounded-lg border border-border text-sm">
      <Link
        href={`${base}pnl`}
        className={cn(
          "px-3 py-1.5 transition-colors",
          view === "pnl" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
        )}
      >
        {t("erp.profit.title")}
      </Link>
      <Link
        href={`${base}cashflow`}
        className={cn(
          "px-3 py-1.5 transition-colors",
          view === "cashflow"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50"
        )}
      >
        {t("erp.cashflow.title")}
      </Link>
    </div>
  )
}
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"

import { monthOfDate, monthRange } from "@/features/erp/finance"
import {
  getBookingRevenue,
  getExpenseSummary,
  getOtherIncomeTotal,
  getRefunds,
} from "@/features/erp/queries"

export default async function ErpProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>
}) {
  const t = await getT()
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(todayInDhaka())
  const { from, to } = monthRange(month)
  const view = params.view === "cashflow" ? "cashflow" : "pnl"

  const [booking, otherIncome, refunds, expenses] = await Promise.all([
    getBookingRevenue(user.id, from, to),
    getOtherIncomeTotal(user.id, from, to),
    getRefunds(user.id, from, to),
    getExpenseSummary(user.id, from, to),
  ])

  if (view === "cashflow") {
    const flow = await getCashFlowByDay(user.id, from, to)
    const totalIn = flow.reduce((a, d) => a + d.moneyIn, 0)
    const totalOut = flow.reduce((a, d) => a + d.moneyOut, 0)
    return (
      <div className="mt-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNav month={month} basePath="/turf-owner/erp/profit" />
          <ViewToggle month={month} view={view} />
        </div>
        <section className="grid gap-3 sm:grid-cols-3">
          <KpiTile label={t("erp.cashflow.moneyIn")} value={formatBdt(Math.round(totalIn))} />
          <KpiTile label={t("erp.cashflow.moneyOut")} value={formatBdt(Math.round(totalOut))} />
          <KpiTile
            label={t("erp.cashflow.netCashFlow")}
            value={formatBdt(Math.round(totalIn - totalOut))}
          />
        </section>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {flow.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              {t("erp.analytics.noData")}
            </li>
          ) : (
            flow.map((d) => (
              <li key={d.date} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{d.date}</span>
                <span className="flex gap-4 tabular-nums">
                  <span className="text-primary">+{formatBdt(Math.round(d.moneyIn))}</span>
                  <span className="text-destructive">−{formatBdt(Math.round(d.moneyOut))}</span>
                  <span className="w-24 text-right font-semibold">{formatBdt(Math.round(d.net))}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    )
  }

  const profit = booking.revenue + otherIncome - refunds - expenses.total
  const fmt = (n: number) => formatBdt(Math.round(n))

  const lines = [
    { key: "lineBooking", value: booking.revenue, href: "/turf-owner/erp/income", positive: true },
    { key: "lineOther", value: otherIncome, href: "/turf-owner/erp/income", positive: true },
    { key: "lineRefunds", value: -refunds, href: "/turf-owner/erp/income", positive: false },
    { key: "lineExpenses", value: -expenses.total, href: "/turf-owner/erp/expenses", positive: false },
  ]

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} basePath="/turf-owner/erp/profit" />
        <ViewToggle month={month} view={view} />
      </div>

      {expenses.total === 0 && booking.bookingCount === 0 && otherIncome === 0 ? (
        <EmptyState
          icon={PiggyBankIcon}
          title={t("erp.expenses.empty")}
          description={t("erp.expenses.emptyBody")}
        />
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">
              {t("erp.profit.monthProfit")}
            </p>
            <p
              className={`mt-1 font-heading text-4xl font-semibold tabular-nums ${
                profit >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {fmt(profit)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("erp.profit.ownerShareHint")}
            </p>
          </section>

          <section aria-label={t("erp.profit.breakdown")}>
            <h2 className="mb-2 font-heading text-base font-semibold">
              {t("erp.profit.breakdown")}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {lines.map((l) => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span>{t(`erp.profit.${l.key}`)}</span>
                    <span
                      className={`tabular-nums ${l.value < 0 ? "text-destructive" : ""}`}
                    >
                      {l.value < 0 ? "−" : ""}
                      {fmt(Math.abs(l.value))}
                    </span>
                  </Link>
                </li>
              ))}
              <li className="flex items-center justify-between bg-muted/40 px-4 py-3 font-semibold">
                <span>{t("erp.profit.lineNet")}</span>
                <span className={`tabular-nums ${profit >= 0 ? "text-primary" : "text-destructive"}`}>
                  {fmt(profit)}
                </span>
              </li>
            </ul>
          </section>

          {expenses.byCategory.length > 0 ? (
            <section>
              <h2 className="mb-2 font-heading text-base font-semibold">
                {t("erp.expenses.byCategory")}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {expenses.byCategory.map((c) => (
                  <li
                    key={c.categoryId}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
                  >
                    <span>{c.slug ? t(`erp.categories.${c.slug}`) : c.name}</span>
                    <span className="font-semibold tabular-nums">{fmt(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="rounded-xl border border-dashed border-border bg-card/50 p-5">
        <div className="flex items-start gap-3">
          <LockIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-heading text-sm font-semibold">
              {t("erp.profit.premiumRangeTitle")}
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {t("erp.premium.badge")}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("erp.profit.premiumRangeDesc")}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
