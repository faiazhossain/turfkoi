import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getPlayerProfile } from "@/features/player/queries"
import { getSession } from "@/lib/auth"
import { DeleteAccountButton } from "@/components/auth/delete-account-button"
import { AvatarField } from "@/components/player/avatar-field"
import { buildMetadata } from "@/i18n/metadata"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.settingsTitle" })
}

export default async function SettingsPage() {
  const t = await getT()
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const profile = await getPlayerProfile(session.user.id)

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <header>
        <h1 className="font-heading text-2xl font-semibold">
          {t("settings.title")}
        </h1>
        <p className="text-sm text-dt-dim">{t("settings.desc")}</p>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">
            {t("settings.profilePhoto")}
          </h2>
          <Link
            href="/app/profile/edit"
            className="text-sm text-dt-dim underline-offset-2 hover:text-dt-txt hover:underline"
          >
            {t("profile.editCta")}
          </Link>
        </div>
        <AvatarField
          userId={session.user.id}
          avatarType={profile?.avatarType ?? null}
          avatarPublicId={profile?.avatarPublicId ?? null}
          avatarPresetId={profile?.avatarPresetId ?? null}
          userName={session.user.name ?? null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {t("settings.dangerZone")}
        </h2>
        <div className="rounded-lg border border-dt-line bg-dt-card p-4">
          <p className="font-medium">{t("settings.deleteTitle")}</p>
          <p className="mt-1 text-sm text-dt-dim">
            {t("settings.deleteDesc")}
          </p>
          <div className="mt-4">
            <DeleteAccountButton />
          </div>
        </div>
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
