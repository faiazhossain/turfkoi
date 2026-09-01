import { redirect } from "next/navigation"
import { WalletIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { MonthNav, VoidExpenseButton } from "@/components/erp"
import { AddExpenseSheet } from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { formatSlotDate } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

import { monthOfDate, monthRange } from "@/features/erp/finance"
import { countActiveRules, getExpenseSummary, listCategories, listExpenses } from "@/features/erp/queries"

export default async function ErpExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const [t, locale, params] = await Promise.all([getT(), getLocale(), searchParams])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const today = todayInDhaka()
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(today)
  const { from, to } = monthRange(month)

  const [categories, expenses, summary, activeRules] = await Promise.all([
    listCategories(user.id),
    listExpenses(user.id, from, to),
    getExpenseSummary(user.id, from, to),
    countActiveRules(user.id),
  ])
  const categoryOptions = categories.map((c) => ({
    id: c.id,
    label: c.isSystem ? t(`erp.categories.${c.slug}`) : c.name,
  }))

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} basePath="/turf-owner/erp/expenses" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-dt-dim">
            {t("erp.expenses.monthTotal", {
              amount: Math.round(summary.total).toLocaleString(),
            })}
          </span>
          <AddExpenseSheet categories={categoryOptions} today={today} canRepeat={activeRules < 3} />
        </div>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title={t("erp.expenses.empty")}
          description={t("erp.expenses.emptyBody")}
        />
      ) : (
        <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
          {expenses.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {e.categorySlug
                    ? t(`erp.categories.${e.categorySlug}`)
                    : e.categoryName}
                  <span className="ml-2 rounded bg-dt-card2 px-1.5 py-0.5 text-[10px] uppercase text-dt-dim">
                    {t(`erp.expenses.source${e.source.charAt(0).toUpperCase()}${e.source.slice(1)}`)}
                  </span>
                </p>
                <p className="text-xs text-dt-dim">
                  {formatSlotDate(e.date, locale)}
                  {e.vendor ? ` · ${e.vendor}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">
                  {formatBdt(Number(e.amount))}
                </span>
                <VoidExpenseButton id={e.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {summary.byCategory.length > 0 ? (
        <section>
          <h2 className="mb-2 font-heading text-base font-semibold">
            {t("erp.expenses.byCategory")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {summary.byCategory.map((c) => (
              <li
                key={c.categoryId}
                className="flex items-center justify-between rounded-lg border border-dt-line bg-dt-card px-4 py-3 text-sm"
              >
                <span>{c.slug ? t(`erp.categories.${c.slug}`) : c.name}</span>
                <span className="font-semibold tabular-nums">{formatBdt(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
