import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { EmptyState } from "@/components/shared"
import { AdminSubNav } from "@/components/admin"
import { getCurrentUser } from "@/lib/auth"
import { countPendingApplications } from "@/features/turf-applications/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminTitle" })
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("admin")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("admin.notAdminTitle")}
          description={t("admin.notAdminDesc")}
        />
      </div>
    )
  }

  // Badge on the Applications sub-nav item (kept fresh by the revalidatePath
  // calls in the application actions).
  const pendingApplications = await countPendingApplications()

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.subtitle")}</p>
      </header>
      <AdminSubNav pendingApplications={pendingApplications} />
      {children}
    </div>
  )
}
