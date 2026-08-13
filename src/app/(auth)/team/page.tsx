import Link from "next/link"
import { redirect } from "next/navigation"
import { PlusIcon, UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState, StatusBadge } from "@/components/shared"
import { getCurrentUser } from "@/lib/auth"
import { listMyTeams } from "@/features/teams/queries"

const ROLE_TONE: Record<string, "primary" | "success" | "warning" | "neutral"> = {
  owner: "primary",
  captain: "success",
  manager: "warning",
  player: "neutral",
}

export default async function TeamDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const myTeams = await listMyTeams(user.id)

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Teams</h1>
          <p className="text-sm text-muted-foreground">
            {myTeams.length} team{myTeams.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button render={<Link href="/team/new" />}>
          <PlusIcon aria-hidden />
          Create team
        </Button>
      </header>

      {myTeams.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="You're not in any teams yet"
          description="Create a team to start booking matches and finding opponents."
          action={
            <Button render={<Link href="/team/new" />}>
              Create your first team
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {myTeams.map((t) => (
            <li key={t.id}>
              <Link
                href={`/team/${t.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-heading font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">/team/{t.slug}</p>
                </div>
                <StatusBadge status={ROLE_TONE[t.role]} showIcon={false}>
                  {t.role}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
