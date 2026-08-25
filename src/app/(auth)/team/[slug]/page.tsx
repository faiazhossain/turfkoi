import type { Metadata } from "next"
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
import { getT } from "@/i18n/server"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const team = await getTeamBySlug(slug)
  return { title: team?.name ?? slug }
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const t = await getT()
  const team = await getTeamBySlug(slug)
  if (!team) notFound()

  const userRole = await getTeamRole(team.id, user.id)
  if (!userRole) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("team.notMemberTitle")}
          description={t("team.notMemberDesc")}
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
          {t("team.title")}
        </Link>{" "}
        / <span className="text-foreground">{team.name}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {team.logoPublicId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientImageUrl(team.logoPublicId, "thumb")}
              alt={t("team.logoAlt", { name: team.name })}
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
            {t("common.edit")}
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
        title={t("team.matchesSoonTitle")}
        description={t("team.matchesSoonDesc")}
      />
    </div>
  )
}
