import { redirect } from "next/navigation"

import { EmptyState, StatusBadge } from "@/components/shared"
import { PremiumRequestForm } from "@/components/erp/premium-request-form"
import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { formatBdt } from "@/lib/pricing"

import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"
import {
  getOwnerPremiumRequests,
  getPendingPremiumRequest,
} from "@/features/erp/premium"
import { ERP_MFS_ACCOUNTS, ERP_PREMIUM_PLANS } from "@/features/erp/premium-plans"
import { daysUntil } from "@/features/erp/finance"
import { todayInDhaka } from "@/lib/slot-expansion"

export default async function ErpPremiumPage() {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [profile, pending, history] = await Promise.all([
    ensureErpProfile(user.id),
    getPendingPremiumRequest(user.id),
    getOwnerPremiumRequests(user.id),
  ])
  const plan = getErpPlanState(profile)

  const statusLine =
    plan.tier === "premium"
      ? t("erp.premium.statusPremium", {
          date: profile.premiumUntil
            ? profile.premiumUntil.toISOString().slice(0, 10)
            : "",
        })
      : plan.tier === "trial"
        ? t("erp.premium.statusTrial", { days: plan.trialDaysLeft })
        : t("erp.premium.statusFree")

  return (
    <div className="mt-4 max-w-2xl space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-base font-semibold">
          {t("erp.premium.title")}
        </h2>
        <p className="mt-1 text-sm">{statusLine}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("erp.premium.valueLine")}
        </p>
      </section>

      {pending ? (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-5">
          <StatusBadge status="warning">{t("erp.premium.pendingBadge")}</StatusBadge>
          <p className="mt-2 text-sm">{t("erp.premium.pendingBody")}</p>
        </section>
      ) : null}

      {pending ? null : (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 font-heading text-sm font-semibold">
            {t("erp.premium.howTo")}
          </h3>
          <ol className="mb-5 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>{t("erp.premium.step1")}</li>
            <li>{t("erp.premium.step2")}</li>
            <li>{t("erp.premium.step3")}</li>
          </ol>
          <PremiumRequestForm
            userId={user.id}
            plans={ERP_PREMIUM_PLANS.map((p) => ({
              months: p.months,
              amountBdt: p.amountBdt,
            }))}
            mfsAccounts={ERP_MFS_ACCOUNTS}
          />
        </section>
      )}

      <section>
        <h3 className="mb-2 font-heading text-sm font-semibold">
          {t("erp.premium.historyTitle")}
        </h3>
        {history.length === 0 ? (
          <EmptyState title={t("erp.premium.historyEmpty")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {t(`erp.premium.methods.${r.method}`)} ·{" "}
                    {t("erp.premium.months", { months: r.months })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.createdAt.toISOString().slice(0, 10)} · {r.transactionId}
                  </p>
                </div>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{formatBdt(Number(r.amount))}</span>
                  <StatusBadge
                    status={
                      r.status === "approved"
                        ? "success"
                        : r.status === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {t(`erp.premium.status.${r.status}`)}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {t("erp.premium.trialNote", {
          days: daysUntil(profile.trialEndsAt.toISOString().slice(0, 10), todayInDhaka()),
        })}
      </p>
    </div>
  )
}
