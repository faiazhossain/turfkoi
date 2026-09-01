import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { getPlayerProfile } from "@/features/player/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { getSession } from "@/lib/auth"
import {
  ProfileEditForm,
  type ProfileEditData,
} from "@/components/player/profile-edit-form"

export async function generateMetadata() {
  return buildMetadata({ titleKey: "metadata.profileEditTitle" })
}

export default async function ProfileEditPage() {
  const [session, t] = await Promise.all([getSession(), getT()])
  if (!session?.user) redirect("/login")

  const profile = await getPlayerProfile(session.user.id)
  const data: ProfileEditData = {
    name: session.user.name ?? null,
    playerId: profile?.playerId ?? null,
    username: profile?.username ?? null,
    position: profile?.position ?? null,
    secondaryPosition: profile?.secondaryPosition ?? null,
    skill: profile?.skill ?? null,
    area: profile?.area ?? null,
    bio: profile?.bio ?? null,
    coords: profile?.coords ?? null,
    avatarType: profile?.avatarType ?? null,
    avatarPublicId: profile?.avatarPublicId ?? null,
    avatarPresetId: profile?.avatarPresetId ?? null,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-dt-dim">
        <Link
          href="/app/profile"
          className="inline-flex items-center gap-1 hover:text-dt-txt"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          {t("profile.edit.backToProfile")}
        </Link>
      </nav>
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          {t("profile.edit.title")}
        </h1>
        <p className="text-sm text-dt-dim">{t("profile.edit.desc")}</p>
      </header>
      <ProfileEditForm userId={session.user.id} profile={data} />
    </div>
  )
}

export const dynamic = "force-dynamic"
