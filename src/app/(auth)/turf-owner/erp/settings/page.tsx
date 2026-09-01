import { redirect } from "next/navigation"
import { DownloadIcon, LockIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { getCurrentUser } from "@/lib/auth"
import { formatBdt } from "@/lib/pricing"
import { formatDistanceToNowIn } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"
import { listAuditLogs } from "@/features/erp/queries"
import { monthOfDate } from "@/features/erp/finance"
import { todayInDhaka } from "@/lib/slot-expansion"

export default async function ErpSettingsPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [profile, auditLogs] = await Promise.all([
    ensureErpProfile(user.id),
    listAuditLogs(user.id),
  ])
  const plan = getErpPlanState(profile)
  const month = monthOfDate(todayInDhaka())

  const planLabel =
    plan.tier === "premium"
      ? t("erp.settings.planPremium")
      : plan.tier === "trial"
        ? plan.trialDaysLeft > 0
          ? t("erp.settings.planTrial", { days: plan.trialDaysLeft })
          : t("erp.settings.planTrialEnded")
        : t("erp.settings.planFree")

  return (
    <div className="mt-4 space-y-6">
      <section className="rounded-xl border border-dt-line bg-dt-card p-5">
        <h2 className="font-heading text-base font-semibold">{t("erp.settings.planCard")}</h2>
        <p className="mt-1 text-sm">
          <span className="font-medium">{planLabel}</span>
        </p>
        <p className="mt-1 text-xs text-dt-dim">{t("erp.plan.seeWhatStaysFree")}</p>
        {plan.tier !== "premium" ? (
          <a
            href="/turf-owner/erp/premium"
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-dt-green px-4 text-sm font-medium text-dt-ink"
          >
            {t("erp.premium.upgradeCta")}
          </a>
        ) : null}
      </section>

      <section className="rounded-xl border border-dt-line bg-dt-card p-5">
        <h2 className="font-heading text-base font-semibold">{t("erp.settings.exportCard")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/turf-owner/erp/export?type=expenses&month=${month}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dt-line px-4 text-sm font-medium transition-colors hover:bg-dt-card2/50"
          >
            <DownloadIcon className="size-4" aria-hidden />
            {t("erp.settings.exportExpenses")}
          </a>
          <a
            href={`/turf-owner/erp/export?type=income&month=${month}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dt-line px-4 text-sm font-medium transition-colors hover:bg-dt-card2/50"
          >
            <DownloadIcon className="size-4" aria-hidden />
            {t("erp.settings.exportIncome")}
          </a>
        </div>
        <p className="mt-2 text-xs text-dt-dim">{t("erp.settings.exportHint")}</p>
      </section>

      <section className="rounded-xl border border-dashed border-dt-line bg-dt-card/50 p-5">
        <div className="flex items-start gap-3">
          <LockIcon className="mt-0.5 size-5 text-dt-dim" aria-hidden />
          <div>
            <p className="font-heading text-sm font-semibold">
              {t("erp.settings.lockedCategoriesTitle")}
              <span className="ml-2 rounded bg-dt-card2 px-1.5 py-0.5 text-[10px] uppercase text-dt-dim">
                {t("erp.premium.badge")}
              </span>
            </p>
            <p className="mt-1 text-sm text-dt-dim">
              {t("erp.settings.lockedCategoriesDesc")}
            </p>
            <p className="mt-3 font-heading text-sm font-semibold">
              {t("erp.settings.lockedTargetsTitle")}
            </p>
            <p className="mt-1 text-sm text-dt-dim">
              {t("erp.settings.lockedTargetsDesc")}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-base font-semibold">
          {t("erp.settings.auditCard")}
        </h2>
        {auditLogs.length === 0 ? (
          <EmptyState title={t("erp.settings.auditEmpty")} />
        ) : (
          <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
            {auditLogs.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{t(`erp.audit.${a.entity}`)}</span>{" "}
                  <span className="text-dt-dim">{t(`erp.audit.${a.action}`)}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-dt-dim">
                  {a.amount ? (
                    <span className="tabular-nums">{formatBdt(Number(a.amount))}</span>
                  ) : null}
                  {formatDistanceToNowIn(a.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
