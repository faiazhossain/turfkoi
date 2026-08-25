import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PlusIcon, UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState, StatusBadge } from "@/components/shared"
import { getCurrentUser } from "@/lib/auth"
import { listMyTeams } from "@/features/teams/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { teamMemberRoleLabel } from "@/i18n/labels"

const ROLE_TONE: Record<string, "primary" | "success" | "warning" | "neutral"> = {
  owner: "primary",
  captain: "success",
  manager: "warning",
  player: "neutral",
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.teamTitle" })
}

export default async function TeamDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const t = await getT()
  const myTeams = await listMyTeams(user.id)

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("team.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {myTeams.length === 1
              ? t("team.countOne")
              : t("team.countMany", { count: myTeams.length })}
          </p>
        </div>
        <Button render={<Link href="/team/new" />}>
          <PlusIcon aria-hidden />
          {t("team.createTeam")}
        </Button>
      </header>

      {myTeams.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={t("team.emptyTitle")}
          description={t("team.emptyDesc")}
          action={
            <Button render={<Link href="/team/new" />}>
              {t("team.createFirstTeam")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {myTeams.map((tm) => (
            <li key={tm.id}>
              <Link
                href={`/team/${tm.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-heading font-semibold">{tm.name}</p>
                  <p className="text-xs text-muted-foreground">/team/{tm.slug}</p>
                </div>
                <StatusBadge status={ROLE_TONE[tm.role]} showIcon={false}>
                  {t(teamMemberRoleLabel(tm.role))}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
