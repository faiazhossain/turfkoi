import Link from "next/link"

import { listTeamsAdmin } from "@/features/admin/queries"

export default async function AdminTeamsPage() {
  const teams = await listTeamsAdmin()

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold">Teams</h2>
      {teams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No teams yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {teams.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 bg-card p-4 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`/team/${t.slug}`}
                  className="truncate font-heading font-medium hover:underline"
                >
                  {t.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {t.memberCount} member{t.memberCount === 1 ? "" : "s"} ·
                  created {t.createdAt.toISOString().slice(0, 10)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
