import { redirect } from "next/navigation"
import { BadgeCheckIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import {
  GrantPremiumControl,
  ReviewButtons,
} from "@/components/admin/erp-premium-review"
import { getCurrentUser } from "@/lib/auth"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"

import {
  listErpProfileAdminRows,
  listPendingPremiumRequests,
} from "@/features/erp/premium"
import { imageUrl } from "@/features/images/service"

export default async function AdminErpPremiumPage() {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("admin")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("admin.notAdminTitle")}
          description={t("admin.notAdminDesc")}
        />
      </div>
    )
  }

  const [pending, profiles] = await Promise.all([
    listPendingPremiumRequests(),
    listErpProfileAdminRows(),
  ])
  const now = new Date()

  function planState(p: (typeof profiles)[number]) {
    if (p.plan === "premium" && p.premiumUntil && p.premiumUntil > now) {
      const days = Math.ceil((p.premiumUntil.getTime() - now.getTime()) / 86_400_000)
      return { label: t("erp.premiumAdmin.statePremium", { days }), variant: "success" as const }
    }
    const days = Math.ceil((p.trialEndsAt.getTime() - now.getTime()) / 86_400_000)
    if (days > 0) {
      return { label: t("erp.premiumAdmin.stateTrial", { days }), variant: "info" as const }
    }
    return { label: t("erp.premiumAdmin.stateFree"), variant: "neutral" as const }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {t("erp.premiumAdmin.pendingTitle")}
          {pending.length > 0 ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <EmptyState title={t("erp.premiumAdmin.pendingEmpty")} />
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-dt-line bg-dt-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-heading font-semibold">
                      {r.ownerName ?? "—"}{" "}
                      <span className="font-mono text-xs font-normal text-dt-dim">
                        {r.ownerPhone}
                      </span>
                    </p>
                    <p>
                      {t(`erp.premium.methods.${r.method}`)} ·{" "}
                      {t("erp.premium.months", { months: r.months })} ·{" "}
                      <span className="font-semibold tabular-nums">
                        {formatBdt(Number(r.amount))}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-dt-dim">
                      {t("erp.premium.senderNumber")}: {r.senderNumber} · TxID:{" "}
                      {r.transactionId}
                    </p>
                    {r.ownerNote ? (
                      <p className="text-xs text-dt-dim">“{r.ownerNote}”</p>
                    ) : null}
                  </div>
                  <ReviewButtons requestId={r.id} />
                </div>
                {r.receiptPublicId ? (
                  <div className="mt-3">
                    <p className="mb-1 flex items-center gap-1 text-xs text-dt-dim">
                      <BadgeCheckIcon className="size-3.5" aria-hidden />
                      {t("erp.premiumAdmin.receipt")}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl(r.receiptPublicId, "card")}
                      alt={t("erp.premiumAdmin.receipt")}
                      className="max-h-64 rounded-lg border border-dt-line"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {t("erp.premiumAdmin.grantTitle")}
        </h2>
        <GrantPremiumControl
          owners={profiles.map((p) => ({
            ownerId: p.ownerId,
            label: `${p.ownerName ?? ""} (${p.ownerPhone})`.trim(),
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {t("erp.premiumAdmin.ownersTitle")}
        </h2>
        <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
          {profiles.map((p) => {
            const state = planState(p)
            return (
              <li key={p.ownerId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {p.ownerName ?? "—"}{" "}
                    <span className="font-mono text-xs text-dt-dim">
                      {p.ownerPhone}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {p.pendingRequests > 0 ? (
                    <StatusBadge status="warning">
                      {t("erp.premiumAdmin.pendingCount", { count: p.pendingRequests })}
                    </StatusBadge>
                  ) : null}
                  <StatusBadge status={state.variant}>{state.label}</StatusBadge>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
