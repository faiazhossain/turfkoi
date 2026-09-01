import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import { getTeamBySlug, getTeamRole } from "@/features/teams/queries"
import { TeamForm } from "@/components/teams/team-form"
import { TeamLogoField } from "@/components/teams/team-logo-field"
import { EmptyState } from "@/components/shared"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.teamEditTitle" })
}

export default async function EditTeamPage({ params }: PageProps) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const t = await getT()
  const team = await getTeamBySlug(slug)
  if (!team) notFound()

  const userRole = await getTeamRole(team.id, user.id)
  if (!can(user, "team.update", { teamId: team.id, teamRole: userRole })) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("team.ownerOnlyTitle")}
          description={t("team.ownerOnlyDesc")}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <nav className="text-sm text-dt-dim">
        <Link href="/team" className="hover:text-dt-txt">
          {t("team.title")}
        </Link>{" "}
        /{" "}
        <Link href={`/team/${team.slug}`} className="hover:text-dt-txt">
          {team.name}
        </Link>{" "}
        / <span className="text-dt-txt">{t("common.edit")}</span>
      </nav>
      <header>
        <h1 className="font-heading text-2xl font-semibold">{t("team.editTitle")}</h1>
      </header>
      <TeamForm mode="edit" teamId={team.id} initial={{ name: team.name, slug: team.slug }} />
      <TeamLogoField teamId={team.id} logoPublicId={team.logoPublicId} />
    </div>
  )
}
