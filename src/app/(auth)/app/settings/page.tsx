import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { playerProfiles } from "@/db/schema"
import { getSession } from "@/lib/auth"
import { DeleteAccountButton } from "@/components/auth/delete-account-button"
import { AvatarField } from "@/components/player/avatar-field"

export default async function SettingsPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const profileRows = await db
    .select({ avatarPublicId: playerProfiles.avatarPublicId })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, session.user.id))
    .limit(1)

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Account preferences and data controls.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Profile photo</h2>
        <AvatarField
          userId={session.user.id}
          avatarPublicId={profileRows[0]?.avatarPublicId ?? null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Danger zone</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">Delete account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Soft-deletes immediately; permanent anonymization after a 14-day
            grace window. Refunds already in flight still settle.
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
