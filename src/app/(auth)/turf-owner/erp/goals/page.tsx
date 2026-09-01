import { redirect } from "next/navigation"
import { TargetIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { BudgetSheet } from "@/components/erp/budget-sheet"
import { MonthNav } from "@/components/erp"
import { PremiumBadge, PremiumLockCard } from "@/components/erp/premium-lock-card"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"
import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"

import { monthOfDate } from "@/features/erp/finance"
import { getBudgetProgress } from "@/features/erp/analytics"

function Row({
  label,
  actual,
  target,
  pct,
  inverse = false,
  fmt,
}: {
  label: string
  actual: number
  target: number
  pct: number | null
  inverse?: boolean
  fmt: (n: number) => string
}) {
  const good = inverse ? actual <= target : actual >= target
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">
          {fmt(actual)} / {target > 0 ? fmt(target) : "—"}
          {pct !== null ? (
            <span className={`ml-2 ${good ? "text-dt-green" : "text-warning"}`}>{pct}%</span>
          ) : null}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded bg-dt-card2">
        <div
          className={`h-full rounded ${pct === null ? "bg-dt-dim/30" : good ? "bg-dt-green" : "bg-warning"}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  )
}

export default async function ErpGoalsPage({
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
        <PremiumLockCard titleKey="erp.goals.lockedTitle" descKey="erp.goals.lockedDesc" />
      </div>
    )
  }

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(todayInDhaka())
  const progress = await getBudgetProgress(user.id, month, todayInDhaka())
  const fmt = (n: number) => formatBdt(Math.round(n))

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PremiumBadge />
          <MonthNav month={month} basePath="/turf-owner/erp/goals" />
        </div>
        <BudgetSheet
          month={month}
          existing={
            progress.hasBudget
              ? {
                  revenueTarget: progress.revenue.target,
                  expenseBudget: progress.expenses.budget,
                  profitTarget: progress.profit.target,
                }
              : null
          }
        />
      </div>

      {!progress.hasBudget ? (
        <EmptyState
          icon={TargetIcon}
          title={t("erp.goals.empty")}
          description={t("erp.goals.emptyBody")}
        />
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-dt-line bg-dt-card p-5">
            <Row
              label={t("erp.goals.form.revenueTarget")}
              actual={progress.revenue.actual}
              target={progress.revenue.target}
              pct={progress.revenue.pct}
              fmt={fmt}
            />
            <Row
              label={t("erp.goals.form.expenseBudget")}
              actual={progress.expenses.actual}
              target={progress.expenses.budget}
              pct={progress.expenses.pct}
              inverse
              fmt={fmt}
            />
            <Row
              label={t("erp.goals.form.profitTarget")}
              actual={progress.profit.actual}
              target={progress.profit.target}
              pct={progress.profit.pct}
              fmt={fmt}
            />
          </section>

          <p className="text-sm text-dt-dim">
            {t("erp.goals.pace", { pace: Math.round(progress.pace * 100) })}
          </p>
          {progress.profit.requiredDaily !== null && progress.profit.requiredDaily > 0 ? (
            <p className="text-sm">
              {t("erp.goals.requiredDaily", {
                amount: fmt(progress.profit.requiredDaily),
              })}
            </p>
          ) : progress.profit.target > 0 && progress.profit.pct === 100 ? (
            <p className="text-sm text-dt-green">{t("erp.goals.targetMet")}</p>
          ) : null}
        </>
      )}
    </div>
  )
}
