import Link from "next/link"
import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { KpiTile } from "@/components/turfs"
import { PayoutsPanel } from "@/components/bookings/payouts-panel"
import { getAdminKPIs, listDisputedMatches, listRefundRequests, listReports } from "@/features/admin/queries"

function fmtBdt(n: number) {
  return `৳${n.toLocaleString()}`
}

export default async function AdminOverviewPage() {
  // This week's payout window (Mon–Sun, UTC date strings).
  const now = new Date()
  const day = now.getUTCDay()
  const mondayOffset = day === 0 ? 6 : day - 1
  const periodEnd = now.toISOString().slice(0, 10)
  const periodStart = new Date(now.getTime() - mondayOffset * 86400000)
    .toISOString()
    .slice(0, 10)

  const [kpis, disputes, pendingRefunds, openReports] = await Promise.all([
    getAdminKPIs(),
    listDisputedMatches(),
    listRefundRequests({ status: "pending", limit: 5 }),
    listReports({ limit: 5 }),
  ])

  // Payouts list is fetched inside PayoutsPanel's props via listAllPayouts there
  // — keep using the existing import path so the Phase 3 surface stays intact.
  const { listAllPayouts } = await import("@/features/bookings/queries")
  const payouts = await listAllPayouts(30)

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiTile
          label="Users"
          value={kpis.totalUsers}
          hint="Active + suspended"
        />
        <KpiTile
          label="Turfs"
          value={`${kpis.totalTurfs}`}
          hint={`${kpis.pendingTurfs} pending verification`}
        />
        <KpiTile
          label="Teams"
          value={kpis.totalTeams}
        />
        <KpiTile
          label="Active bookings"
          value={kpis.activeBookings}
          hint="Held → confirmed"
        />
        <KpiTile
          label="Revenue (30d)"
          value={fmtBdt(kpis.revenue30d)}
          hint="Gross transaction volume"
        />
        <KpiTile
          label="Failed txns (30d)"
          value={kpis.failedTransactions}
        />
        <KpiTile
          label="Pending payouts"
          value={`${kpis.pendingPayoutsCount} · ${fmtBdt(kpis.pendingPayoutsAmount)}`}
        />
        <KpiTile
          label="Open reports"
          value={kpis.openReports}
        />
      </section>

      {/* Attention queue: refunds over disputes over reports. */}
      {(pendingRefunds.length > 0 || disputes.length > 0 || openReports.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">Needs attention</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {pendingRefunds.length > 0 ? (
              <li className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon className="size-4 text-warning" aria-hidden />
                  <Link
                    href="/admin/bookings"
                    className="font-heading text-sm font-semibold hover:underline"
                  >
                    {pendingRefunds.length} pending refund request
                    {pendingRefunds.length === 1 ? "" : "s"}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Refunds over ৳5,000 need a second admin.
                </p>
              </li>
            ) : null}
            {disputes.length > 0 ? (
              <li className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlertIcon className="size-4 text-destructive" aria-hidden />
                  <Link
                    href="/admin/matches"
                    className="font-heading text-sm font-semibold hover:underline"
                  >
                    {disputes.length} disputed match
                    {disputes.length === 1 ? "" : "es"}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Confirm or scratch each result.
                </p>
              </li>
            ) : null}
            {openReports.length > 0 ? (
              <li className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlertIcon className="size-4 text-info" aria-hidden />
                  <Link
                    href="/admin/reports"
                    className="font-heading text-sm font-semibold hover:underline"
                  >
                    {openReports.length} open report
                    {openReports.length === 1 ? "" : "s"}
                  </Link>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      )}

      <PayoutsPanel
        payouts={payouts}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />

      {kpis.totalTurfs === 0 && kpis.totalUsers === 0 ? (
        <EmptyState
          title="Nothing to oversee yet"
          description="Once users sign up and turfs are listed, KPIs and oversight queues will appear here."
        />
      ) : null}
    </div>
  )
}

export const dynamic = "force-dynamic"
