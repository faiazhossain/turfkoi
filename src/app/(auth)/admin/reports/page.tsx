import { StatusBadge } from "@/components/shared"
import { ReportStatusSelect } from "@/components/admin"
import { listReports } from "@/features/admin/queries"

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
  const { status } = await searchParams
  const reports = await listReports({
    status: status === "all" ? undefined : status,
    limit: 50,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Reports</h2>
        <form className="flex items-center gap-2 text-sm">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-border bg-background px-2 py-1.5"
          >
            <option value="">All</option>
            {["pending", "reviewing", "resolved", "dismissed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted"
          >
            Filter
          </button>
        </form>
      </div>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No reports.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge status={TONE[r.status] ?? "neutral"} showIcon={false}>
                    {r.status}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {r.entityType} · {r.entityId.slice(0, 8)}
                  </span>
                </div>
                <p className="mt-1 text-sm">{r.reason}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  by {r.reporterPhone} · {r.createdAt.toISOString().slice(0, 10)}
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
