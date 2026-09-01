import type { Metadata } from "next"

import { StatusBadge } from "@/components/shared"
import { ReportStatusSelect } from "@/components/admin"
import { listReports } from "@/features/admin/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminReportsTitle" })
}

const TONE: Record<string, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  reviewing: "info",
  resolved: "success",
  dismissed: "neutral",
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const t = await getT()
  const { status } = await searchParams
  const reports = await listReports({
    status: status === "all" ? undefined : status,
    limit: 50,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t("admin.reports.title")}</h2>
        <form className="flex items-center gap-2 text-sm">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-dt-line bg-dt-bg px-2 py-1.5"
          >
            <option value="">{t("admin.all")}</option>
            {["pending", "reviewing", "resolved", "dismissed"].map((s) => (
              <option key={s} value={s}>
                {t(`admin.reports.status.${s}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-dt-line px-3 py-1.5 font-medium hover:bg-dt-card2"
          >
            {t("admin.filter")}
          </button>
        </form>
      </div>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.reports.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dt-line bg-dt-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge status={TONE[r.status] ?? "neutral"} showIcon={false}>
                    {t(`admin.reports.status.${r.status}`)}
                  </StatusBadge>
                  <span className="text-xs text-dt-dim">
                    {r.entityType} · {r.entityId.slice(0, 8)}
                  </span>
                </div>
                <p className="mt-1 text-sm">{r.reason}</p>
                <p className="font-mono text-xs text-dt-dim">
                  {t("admin.reports.by", { phone: r.reporterPhone })} · {r.createdAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <ReportStatusSelect reportId={r.id} status={r.status as never} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
