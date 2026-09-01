import type { Metadata } from "next"
import Link from "next/link"

import { listTeamsAdmin } from "@/features/admin/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminTeamsTitle" })
}

export default async function AdminTeamsPage() {
  const t = await getT()
  const teams = await listTeamsAdmin()

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold">{t("admin.sections.teams")}</h2>
      {teams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.teams.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center justify-between gap-3 bg-dt-card p-4 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`/team/${team.slug}`}
                  className="truncate font-heading font-medium hover:underline"
                >
                  {team.name}
                </Link>
                <p className="text-xs text-dt-dim">
                  {t(team.memberCount === 1 ? "admin.teams.membersOne" : "admin.teams.membersMany", {
                    count: team.memberCount,
                  })}{" "}
                  · {t("admin.teams.created", { date: team.createdAt.toISOString().slice(0, 10) })}
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
