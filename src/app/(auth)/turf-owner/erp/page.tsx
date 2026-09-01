import Link from "next/link"
import { BanknoteIcon, ReceiptTextIcon, WalletIcon, UsersIcon } from "lucide-react"

import { KpiTile } from "@/components/turfs"
import {
  AddBillSheet,
  AddExpenseSheet,
  AddIncomeSheet,
  AddStaffSheet,
} from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { formatBdt } from "@/lib/pricing"
import { todayInDhaka } from "@/lib/slot-expansion"
import { monthOfDate, daysUntil } from "@/features/erp/finance"
import { formatSlotDate } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

import {
  countActiveRules,
  getErpOverview,
  listCategories,
} from "@/features/erp/queries"
import { getTrendAlerts } from "@/features/erp/analytics"

export default async function ErpOverviewPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const today = todayInDhaka()
  const month = monthOfDate(today)
  const [overview, categories, activeRules] = await Promise.all([
    getErpOverview(user.id, month),
    listCategories(user.id),
    countActiveRules(user.id),
  ])
  const categoryOptions = categories.map((c) => ({
    id: c.id,
    label: c.isSystem ? t(`erp.categories.${c.slug}`) : c.name,
  }))
  // Salary is managed by the Salaries module (auto-posts its own expense);
  // offering it as a bill category would double-count staff costs.
  const billCategoryOptions = categoryOptions.filter(
    (c) => !categories.find((raw) => raw.id === c.id && raw.isSystem && raw.slug === "staff_salary")
  )

  const fmt = (n: number) => formatBdt(Math.round(n))

  // Alerts (server-computed): bills due ≤3 days, overdue bills, pending salaries.
  const alerts: { icon: "bill" | "salary"; text: string }[] = []
  for (const bill of overview.upcomingBills) {
    const d = daysUntil(bill.nextDueDate, today)
    if (d === 0) alerts.push({ icon: "bill", text: t("erp.overview.alertBillToday", { name: bill.name }) })
    else if (d > 0 && d <= 3)
      alerts.push({ icon: "bill", text: t("erp.overview.alertBillDue", { name: bill.name, days: d }) })
  }
  if (overview.pendingSalaryCount > 0) {
    alerts.push({
      icon: "salary",
      text: t("erp.overview.alertSalaries", { count: overview.pendingSalaryCount }),
    })
  }

  const needsExpenses = !overview.onboarding.hasExpense || !overview.onboarding.hasRule
  const needsStaff = !overview.onboarding.hasStaff

  // Premium trend alerts (expense spike / occupancy drop) — free tier skips.
  const trendAlerts = overview.plan.isPremiumFeaturesUnlocked
    ? await getTrendAlerts(user.id, month, today)
    : []
  for (const code of trendAlerts) {
    const [kind, valueStr] = code.split(":")
    const value = Number(valueStr)
    if (kind === "expense_spike") {
      alerts.push({
        icon: "bill",
        text: t("erp.alerts.expenseSpike", { percent: Math.round(value) }),
      })
    } else if (kind === "occupancy_drop") {
      alerts.push({ icon: "salary", text: t("erp.alerts.occupancyDrop", { points: Math.round(value) }) })
    }
  }

  return (
    <div className="space-y-8">
      {needsExpenses || needsStaff ? (
        <section className="rounded-xl border border-dt-line bg-dt-card p-5">
          <h2 className="font-heading text-base font-semibold">
            {t("erp.overview.onboardingTitle")}
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{t("erp.overview.onboardingExpenses")}</p>
                <p className="text-dt-dim">{t("erp.overview.onboardingExpensesDesc")}</p>
              </div>
              {needsExpenses ? (
                <AddExpenseSheet categories={categoryOptions} today={today} canRepeat={activeRules < 3} />
              ) : null}
            </li>
            <li className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{t("erp.overview.onboardingStaff")}</p>
                <p className="text-dt-dim">{t("erp.overview.onboardingStaffDesc")}</p>
              </div>
              {needsStaff ? <AddStaffSheet /> : null}
            </li>
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiTile label={t("erp.overview.todayRevenue")} value={fmt(overview.todayRevenue)} />
        <KpiTile
          label={t("erp.overview.monthRevenue")}
          value={fmt(overview.month.bookingRevenue + overview.month.otherIncome)}
          hint={t("erp.overview.bookingsCount", { count: overview.month.bookingCount })}
        />
        <KpiTile label={t("erp.overview.monthExpenses")} value={fmt(overview.month.expenses)} />
        <KpiTile
          label={t("erp.overview.monthProfit")}
          value={fmt(overview.month.profit)}
          className={overview.month.profit >= 0 ? "text-dt-green" : "text-destructive"}
        />
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.overview.alertsTitle")}
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-dt-dim">{t("erp.overview.noAlerts")}</p>
        ) : (
          <ul className="space-y-2">
            {alerts.slice(0, 3).map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-dt-line bg-dt-card px-4 py-3 text-sm"
              >
                {a.icon === "bill" ? (
                  <ReceiptTextIcon className="size-4 text-warning" aria-hidden />
                ) : (
                  <UsersIcon className="size-4 text-warning" aria-hidden />
                )}
                {a.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview.upcomingBills.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">
              {t("erp.overview.upcomingBills")}
            </h2>
            <Link href="/turf-owner/erp/bills" className="text-sm text-dt-green hover:underline">
              {t("erp.nav.bills")} →
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {overview.upcomingBills.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-dt-line bg-dt-card px-4 py-3 text-sm"
              >
                <span>
                  <span className="block font-medium">{b.name}</span>
                  <span className="block text-xs text-dt-dim">
                    {formatSlotDate(b.nextDueDate, locale)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{fmt(b.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.bestWeekday !== null ? (
        <p className="text-sm text-dt-dim">
          {t("erp.overview.insightBestDay", {
            day: t(`erp.weekdays.${overview.bestWeekday}`),
          })}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.overview.quickActions")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <AddExpenseSheet categories={categoryOptions} today={today} canRepeat={activeRules < 3} />
          <AddIncomeSheet today={today} />
          <AddStaffSheet />
          <Link
            href="/turf-owner/erp/staff/salaries"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dt-line px-3 text-sm font-medium text-dt-dim transition-colors hover:bg-dt-card2/50 hover:text-dt-txt"
          >
            <BanknoteIcon className="size-4" aria-hidden />
            {t("erp.overview.qaSalary")}
          </Link>
          <AddBillSheet categories={billCategoryOptions} today={today} />
          <Link
            href="/turf-owner/erp/profit"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dt-line px-3 text-sm font-medium text-dt-dim transition-colors hover:bg-dt-card2/50 hover:text-dt-txt"
          >
            <WalletIcon className="size-4" aria-hidden />
            {t("erp.nav.profit")}
          </Link>
          <Link
            href="/turf-owner/erp/staff/salaries"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dt-line px-3 text-sm font-medium text-dt-dim transition-colors hover:bg-dt-card2/50 hover:text-dt-txt"
          >
            <BanknoteIcon className="size-4" aria-hidden />
            {t("erp.overview.pendingSalariesValue", {
              count: overview.pendingSalaryCount,
              amount: Math.round(overview.pendingSalaryTotal).toLocaleString(),
            })}
          </Link>
        </div>
      </section>
    </div>
  )
}
