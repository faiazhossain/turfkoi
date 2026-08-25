import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { buildMetadata } from "@/i18n/metadata"
import { getCurrentUser } from "@/lib/auth"
import { listNotifications } from "@/features/notifications/queries"
import { NotificationsClient } from "@/features/notifications/components/notifications-client"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.notificationsTitle" })
}

/** Full-screen notification center (auth-gated). */
export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const page = await listNotifications(user.id)
  return <NotificationsClient initial={{ userId: user.id, ...page }} />
}
