import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { TeamForm } from "@/components/teams/team-form"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.teamNewTitle" })
}

export default async function NewTeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const t = await getT()

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <nav className="text-sm text-dt-dim">
        <Link href="/team" className="hover:text-dt-txt">
          {t("team.title")}
        </Link>{" "}
        / <span className="text-dt-txt">{t("team.breadcrumbNew")}</span>
      </nav>
      <header>
        <h1 className="font-heading text-2xl font-semibold">{t("team.createTitle")}</h1>
        <p className="text-sm text-dt-dim">{t("team.createDesc")}</p>
      </header>
      <TeamForm mode="create" />
    </div>
  )
}
