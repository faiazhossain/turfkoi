import Link from "next/link"

import { StatusBadge } from "@/components/shared"
import { VerifyTurfButton } from "@/components/admin"
import { listTurfsAdmin } from "@/features/admin/queries"

export default async function AdminTurfsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "pending" | "verified" | "all" }>
}) {
  const { status } = await searchParams
  const filter = status ?? "all"
  const turfs = await listTurfsAdmin(filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Turfs</h2>
        <div className="flex gap-1 text-sm">
          {(["all", "pending", "verified"] as const).map((f) => (
            <Link
              key={f}
              href={`/admin/turfs?status=${f}`}
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

      {turfs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No turfs match.
        </p>
      ) : (
        <ul className="space-y-2">
          {turfs.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/turfs/${t.slug}`}
                    className="truncate font-heading font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  {t.isVerified ? (
                    <StatusBadge status="success" showIcon={false}>
                      verified
                    </StatusBadge>
                  ) : (
                    <StatusBadge status="warning" showIcon={false}>
                      pending
                    </StatusBadge>
                  )}
                  {!t.isActive ? (
                    <StatusBadge status="neutral" showIcon={false}>
                      inactive
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[t.area, t.city].filter(Boolean).join(", ") || "Location TBD"}
                  {" · "}
                  {t.format === "fives" ? "5-a-side" : "7-a-side"}
                  {" · "}
                  owner {t.ownerPhone}
                </p>
              </div>
              {!t.isVerified ? <VerifyTurfButton turfId={t.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
