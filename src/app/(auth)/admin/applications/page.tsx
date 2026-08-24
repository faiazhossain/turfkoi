import Link from "next/link"

import { StatusBadge } from "@/components/shared"
import { ApproveApplicationPanel } from "@/components/admin"
import { listTurfApplications } from "@/features/turf-applications/queries"

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
  const { status } = await searchParams
  const filter = status ?? "pending"
  const applications = await listTurfApplications(filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Turf applications</h2>
        <div className="flex gap-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/applications?status=${f}`}
              className={
                "rounded-lg border px-3 py-1.5 " +
                (filter === f
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50")
              }
            >
              {f}
            </Link>
          ))}
        </div>
      </div>

      {applications.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No applications.
        </p>
      ) : (
        <ul className="space-y-2">
          {applications.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-heading font-medium">
                    {app.turfName}
                  </span>
                  {app.status === "pending" ? (
                    <StatusBadge status="warning" showIcon={false}>
                      pending
                    </StatusBadge>
                  ) : app.status === "approved" ? (
                    <StatusBadge status="success" showIcon={false}>
                      approved
                    </StatusBadge>
                  ) : (
                    <StatusBadge status="neutral" showIcon={false}>
                      rejected
                    </StatusBadge>
                  )}
                  {app.turfSlug ? (
                    <Link
                      href={`/turfs/${app.turfSlug}`}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      view turf
                    </Link>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {app.contactName} · {app.phone}
                  {app.email ? ` · ${app.email}` : ""}
                  {" · "}
                  {[app.area, app.city].filter(Boolean).join(", ") || "Location TBD"}
                </p>
                {app.address ? (
                  <p className="truncate text-xs text-muted-foreground">{app.address}</p>
                ) : null}
                {app.notes ? (
                  <p className="mt-1 max-w-xl whitespace-pre-line text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Directions:
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
