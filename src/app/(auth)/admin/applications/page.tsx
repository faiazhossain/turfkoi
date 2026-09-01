import type { Metadata } from "next"
import Link from "next/link"

import { StatusBadge } from "@/components/shared"
import { ApproveApplicationPanel } from "@/components/admin"
import { listTurfApplications } from "@/features/turf-applications/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminApplicationsTitle" })
}

const FILTERS = ["pending", "approved", "rejected", "all"] as const

/**
 * Owner-application review queue (Option C). Approving seeds the turf and
 * hands the admin the claim-invite panel; the owner then follows the normal
 * turf-claims flow.
 */
export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: (typeof FILTERS)[number] }>
}) {
  const t = await getT()
  const { status } = await searchParams
  const filter = status ?? "pending"
  const applications = await listTurfApplications(filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t("admin.applications.title")}</h2>
        <div className="flex gap-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/applications?status=${f}`}
              className={
                "rounded-lg border px-3 py-1.5 " +
                (filter === f
                  ? "border-dt-line bg-dt-card2 text-dt-txt"
                  : "border-transparent text-dt-dim hover:bg-dt-card2/50")
              }
            >
              {t(`admin.applications.filters.${f}`)}
            </Link>
          ))}
        </div>
      </div>

      {applications.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.applications.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {applications.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dt-line bg-dt-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-heading font-medium">
                    {app.turfName}
                  </span>
                  {app.status === "pending" ? (
                    <StatusBadge status="warning" showIcon={false}>
                      {t("admin.applications.filters.pending")}
                    </StatusBadge>
                  ) : app.status === "approved" ? (
                    <StatusBadge status="success" showIcon={false}>
                      {t("admin.applications.filters.approved")}
                    </StatusBadge>
                  ) : (
                    <StatusBadge status="neutral" showIcon={false}>
                      {t("admin.applications.filters.rejected")}
                    </StatusBadge>
                  )}
                  {app.turfSlug ? (
                    <Link
                      href={`/turfs/${app.turfSlug}`}
                      className="text-xs text-dt-dim hover:underline"
                    >
                      {t("admin.applications.viewTurf")}
                    </Link>
                  ) : null}
                </div>
                <p className="truncate text-xs text-dt-dim">
                  {app.contactName} · {app.phone}
                  {app.email ? ` · ${app.email}` : ""}
                  {" · "}
                  {[app.area, app.city].filter(Boolean).join(", ") || t("turfs.locationTbd")}
                </p>
                {app.address ? (
                  <p className="truncate text-xs text-dt-dim">{app.address}</p>
                ) : null}
                {app.notes ? (
                  <p className="mt-1 max-w-xl whitespace-pre-line text-xs text-dt-dim">
                    <span className="font-medium text-dt-txt">
                      {t("admin.applications.directions")}
                    </span>{" "}
                    {app.notes}
                  </p>
                ) : null}
              </div>
              {app.status === "pending" ? (
                <ApproveApplicationPanel
                  application={{
                    id: app.id,
                    turfName: app.turfName,
                    phone: app.phone,
                    email: app.email,
                    city: app.city,
                    area: app.area,
                    address: app.address,
                    coords: app.coords,
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
