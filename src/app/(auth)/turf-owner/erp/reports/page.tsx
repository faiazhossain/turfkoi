import { redirect } from "next/navigation"
import { DownloadIcon } from "lucide-react"

import { MonthNav } from "@/components/erp"
import { PrintButton } from "@/components/erp/print-button"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"

import { monthOfDate, monthRange } from "@/features/erp/finance"
import {
  getBookingRevenue,
  getExpenseSummary,
  getOtherIncomeTotal,
  getRefunds,
  getSalaryMonth,
} from "@/features/erp/queries"
import { getBudgetProgress } from "@/features/erp/analytics"

export default async function ErpReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const t = await getT()
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(todayInDhaka())
  const { from, to } = monthRange(month)

  const [booking, other, refunds, expenses, salaryRows, budget] = await Promise.all([
    getBookingRevenue(user.id, from, to),
    getOtherIncomeTotal(user.id, from, to),
    getRefunds(user.id, from, to),
    getExpenseSummary(user.id, from, to),
    getSalaryMonth(user.id, month),
    getBudgetProgress(user.id, month, todayInDhaka()),
  ])
  const profit = booking.revenue + other - refunds - expenses.total
  const staffCost = salaryRows.reduce((a, r) => a + r.paidAmount, 0)
  const fmt = (n: number) => formatBdt(Math.round(n))

  return (
    <div className="mt-4 space-y-6 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <MonthNav month={month} basePath="/turf-owner/erp/reports" />
        <div className="flex flex-wrap gap-2">
          <a
            href={`/turf-owner/erp/export?type=expenses&month=${month}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <DownloadIcon className="size-4" aria-hidden />
            CSV
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Printable monthly business summary */}
      <article className="space-y-6 rounded-xl border border-border bg-card p-6 print:border-0 print:bg-white print:p-0 print:text-black">
        <header>
          <h2 className="font-heading text-lg font-semibold">
            {t("erp.reports.title", { month })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("erp.reports.period", { from, to })} · DeshiTurf
          </p>
        </header>

        <section>
          <h3 className="mb-2 font-heading text-sm font-semibold">
            {t("erp.reports.pnlHeader")}
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {(
                [
                  [t("erp.profit.lineBooking"), booking.revenue],
                  [t("erp.profit.lineOther"), other],
                  [t("erp.profit.lineRefunds"), -refunds],
                  [t("erp.profit.lineExpenses"), -expenses.total],
                ] as [string, number][]
              ).map(([label, value]) => (
                <tr key={label} className="border-b border-border/60">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(value)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5">{t("erp.profit.lineNet")}</td>
                <td
                  className={`py-1.5 text-right tabular-nums print:text-black ${
                    profit >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {fmt(profit)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("erp.profit.ownerShareHint")}
          </p>
        </section>

        {expenses.byCategory.length > 0 ? (
          <section>
            <h3 className="mb-2 font-heading text-sm font-semibold">
              {t("erp.expenses.byCategory")}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {expenses.byCategory.map((c) => (
                  <tr key={c.categoryId} className="border-b border-border/60">
                    <td className="py-1.5">
                      {c.slug ? t(`erp.categories.${c.slug}`) : c.name}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(c.total)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1.5">{t("erp.profit.lineExpenses")}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(expenses.total)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("erp.analytics.staffCost")}</p>
            <p className="font-semibold tabular-nums">{fmt(staffCost)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("erp.income.bookingCount", { count: booking.bookingCount })}</p>
            <p className="font-semibold tabular-nums">{booking.bookingCount}</p>
          </div>
          {budget.hasBudget ? (
            <div>
              <p className="text-xs text-muted-foreground">{t("erp.goals.form.profitTarget")}</p>
              <p className="font-semibold tabular-nums">
                {budget.profit.pct !== null ? `${budget.profit.pct}%` : "—"}
              </p>
            </div>
          ) : null}
        </section>
      </article>
    </div>
  )
}
