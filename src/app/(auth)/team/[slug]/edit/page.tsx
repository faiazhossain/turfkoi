import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import { getTeamBySlug, getTeamRole } from "@/features/teams/queries"
import { TeamForm } from "@/components/teams/team-form"
import { EmptyState } from "@/components/shared"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function EditTeamPage({ params }: PageProps) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const team = await getTeamBySlug(slug)
  if (!team) notFound()

  const userRole = await getTeamRole(team.id, user.id)
  if (!can(user, "team.update", { teamId: team.id, teamRole: userRole })) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Only the owner can edit team settings"
          description="Ask the team owner to make the change."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/team" className="hover:text-foreground">
          Teams
        </Link>{" "}
        /{" "}
        <Link href={`/team/${team.slug}`} className="hover:text-foreground">
          {team.name}
        </Link>{" "}
        / <span className="text-foreground">Edit</span>
      </nav>
      <header>
        <h1 className="font-heading text-2xl font-semibold">Edit team</h1>
      </header>
      <TeamForm mode="edit" teamId={team.id} initial={{ name: team.name, slug: team.slug }} />
    </div>
  )
}
