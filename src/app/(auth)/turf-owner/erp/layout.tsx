import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { EmptyState } from "@/components/shared"
import { ErpSubNav } from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.erpTitle" })
}

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("turf_owner")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("turfOwner.notOwnerTitle")}
          description={t("turfOwner.notOwnerDesc")}
        />
      </div>
    )
  }

  const plan = getErpPlanState(await ensureErpProfile(user.id))

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("erp.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("erp.subtitle")}</p>
        </div>
        {plan.isPremiumFeaturesUnlocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {plan.tier === "premium"
              ? t("erp.plan.premium")
              : t("erp.plan.trial", { days: plan.trialDaysLeft })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("erp.plan.free")}
          </span>
        )}
      </header>
      {plan.tier === "trial" && plan.trialDaysLeft <= 7 ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          {t("erp.plan.trialEnding", { days: plan.trialDaysLeft })}
        </div>
      ) : null}
      <ErpSubNav />
      {children}
    </div>
  )
}
