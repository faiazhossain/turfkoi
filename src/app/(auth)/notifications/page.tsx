import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { listNotifications } from "@/features/notifications/queries"
import { NotificationsClient } from "@/features/notifications/components/notifications-client"

export const metadata = { title: "Notifications — Turfkoi" }

/** Full-screen notification center (auth-gated). */
export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const page = await listNotifications(user.id)
  return <NotificationsClient initial={{ userId: user.id, ...page }} />
}
