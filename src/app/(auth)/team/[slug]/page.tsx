import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared"
import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import {
  getTeamBySlug,
  listTeamMembers,
  listTeamInvitations,
  getTeamRole,
} from "@/features/teams/queries"
import { MemberManager } from "@/components/teams/member-manager"
import { clientImageUrl } from "@/features/images/urls"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const team = await getTeamBySlug(slug)
  if (!team) notFound()

  const userRole = await getTeamRole(team.id, user.id)
  if (!userRole) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Not a member"
          description="You're not a member of this team."
        />
      </div>
    )
  }

  const [members, invitations] = await Promise.all([
    listTeamMembers(team.id),
    listTeamInvitations(team.id),
  ])

  const canManage = can(user, "team.member.manage", {
    teamId: team.id,
    teamRole: userRole,
  })
  const isOwner = userRole === "owner"

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/team" className="hover:text-foreground">
          Teams
        </Link>{" "}
        / <span className="text-foreground">{team.name}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {team.logoPublicId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientImageUrl(team.logoPublicId, "thumb")}
              alt={`${team.name} logo`}
              className="size-12 rounded-lg object-cover"
            />
          ) : null}
          <div>
            <h1 className="font-heading text-2xl font-semibold">{team.name}</h1>
            <p className="text-xs text-muted-foreground">/team/{team.slug}</p>
          </div>
        </div>
        {isOwner ? (
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/team/${team.slug}/edit`} />}
          >
            <PencilIcon aria-hidden />
            Edit
          </Button>
        ) : null}
      </header>

      <MemberManager
        teamId={team.id}
        members={members}
        invitations={invitations}
        canManage={canManage}
        isOwner={isOwner}
        currentUserId={user.id}
      />

      <EmptyState
        title="Matches coming in Phase 5"
        description="Team matchmaking — create matches, find opponents, and track results — arrives next."
      />
    </div>
  )
}
