import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { KpiTile } from "@/components/turfs"
import { getAdminKPIs, listDisputedMatches, listRefundRequests, listReports } from "@/features/admin/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminTitle" })
}

function fmtBdt(n: number) {
  return `৳${n.toLocaleString()}`
}

export default async function AdminOverviewPage() {
  const t = await getT()

  const [kpis, disputes, pendingRefunds, openReports] = await Promise.all([
    getAdminKPIs(),
    listDisputedMatches(),
    listRefundRequests({ status: "pending", limit: 5 }),
    listReports({ limit: 5 }),
  ])

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiTile
          label={t("admin.overview.kpiUsers")}
          value={kpis.totalUsers}
          hint={t("admin.overview.kpiUsersHint")}
        />
        <KpiTile
          label={t("admin.overview.kpiTurfs")}
          value={`${kpis.totalTurfs}`}
          hint={t("admin.overview.kpiPendingVerification", { count: kpis.pendingTurfs })}
        />
        <KpiTile
          label={t("admin.overview.kpiTeams")}
          value={kpis.totalTeams}
        />
        <KpiTile
          label={t("admin.overview.kpiActiveBookings")}
          value={kpis.activeBookings}
          hint={t("admin.overview.kpiActiveBookingsHint")}
        />
        <KpiTile
          label={t("admin.overview.kpiRevenue")}
          value={fmtBdt(kpis.revenue30d)}
          hint={t("admin.overview.kpiRevenueHint")}
        />
        <KpiTile
          label={t("admin.overview.kpiFailedTxns")}
          value={kpis.failedTransactions}
        />
        <KpiTile
          label={t("admin.overview.kpiPendingPayouts")}
          value={`${kpis.pendingPayoutsCount} · ${fmtBdt(kpis.pendingPayoutsAmount)}`}
        />
        <KpiTile
          label={t("admin.overview.kpiOpenReports")}
          value={kpis.openReports}
        />
      </section>

      {/* Attention queue: refunds over disputes over reports. */}
      {(pendingRefunds.length > 0 || disputes.length > 0 || openReports.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">{t("admin.overview.needsAttention")}</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {pendingRefunds.length > 0 ? (
              <li className="rounded-lg border border-dt-line bg-dt-card p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon className="size-4 text-warning" aria-hidden />
                  <Link
                    href="/admin/bookings"
                    className="font-heading text-sm font-semibold hover:underline"
                  >
                    {t(pendingRefunds.length === 1 ? "admin.overview.pendingRefundsOne" : "admin.overview.pendingRefundsMany", {
                      count: pendingRefunds.length,
                    })}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-dt-dim">
                  {t("admin.overview.refundsSecondAdminHint")}
                </p>
              </li>
            ) : null}
            {disputes.length > 0 ? (
              <li className="rounded-lg border border-dt-line bg-dt-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlertIcon className="size-4 text-destructive" aria-hidden />
                  <Link
                    href="/admin/matches"
                    className="font-heading text-sm font-semibold hover:underline"
                  >
                    {t(disputes.length === 1 ? "admin.overview.disputedOne" : "admin.overview.disputedMany", {
                      count: disputes.length,
                    })}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-dt-dim">
                  {t("admin.overview.disputedHint")}
                </p>
              </li>
            ) : null}
            {openReports.length > 0 ? (
              <li className="rounded-lg border border-dt-line bg-dt-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlertIcon className="size-4 text-info" aria-hidden />
                  <Link
                    href="/admin/reports"
                    className="font-heading text-sm font-semibold hover:underline"
                  >
                    {t(openReports.length === 1 ? "admin.overview.openReportsOne" : "admin.overview.openReportsMany", {
                      count: openReports.length,
                    })}
                  </Link>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      )}

      {kpis.totalTurfs === 0 && kpis.totalUsers === 0 ? (
        <EmptyState
          title={t("admin.overview.emptyTitle")}
          description={t("admin.overview.emptyDesc")}
        />
      ) : null}
    </div>
  )
}

export const dynamic = "force-dynamic"
