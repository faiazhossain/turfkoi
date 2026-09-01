import Link from "next/link"
import { redirect } from "next/navigation"
import { WrenchIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { AddMaintenanceSheet, MaintenanceStatusButtons } from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { formatSlotDate } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"
import { listMyTurfs } from "@/features/turfs/queries"

import { listMaintenance } from "@/features/erp/queries"

const STATUS_VARIANT = {
  planned: "warning",
  in_progress: "info",
  done: "success",
} as const

export default async function ErpMaintenancePage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [myTurfs, records] = await Promise.all([
    listMyTurfs(user.id),
    listMaintenance(user.id),
  ])

  if (myTurfs.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={WrenchIcon}
          title={t("erp.maintenance.needTurf")}
          action={
            <Link
              href="/turf-owner/turfs/new"
              className="inline-flex h-9 items-center rounded-lg bg-dt-green px-4 text-sm font-medium text-dt-ink"
            >
              {t("turfOwner.addTurf")}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dt-dim">{t("erp.maintenance.subtitle")}</p>
        <AddMaintenanceSheet
          turfs={myTurfs.map((turf) => ({ id: turf.id, name: turf.name }))}
          today={todayInDhaka()}
        />
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={WrenchIcon}
          title={t("erp.maintenance.empty")}
          description={t("erp.maintenance.emptyBody")}
        />
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dt-line bg-dt-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t(`erp.maintenance.categories.${r.category}`)}
                  <span className="ml-2 text-xs text-dt-dim">{r.turfName}</span>
                </p>
                <p className="text-xs text-dt-dim">
                  {formatSlotDate(r.date, locale)}
                  {r.vendor ? ` · ${r.vendor}` : ""}
                  {r.description ? ` · ${r.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {Number(r.cost) > 0 ? (
                  <span className="font-semibold tabular-nums">{formatBdt(Number(r.cost))}</span>
                ) : null}
                <StatusBadge status={STATUS_VARIANT[r.status as keyof typeof STATUS_VARIANT]}>
                  {t(`erp.maintenance.statuses.${r.status}`)}
                </StatusBadge>
                <MaintenanceStatusButtons id={r.id} status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
