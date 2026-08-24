import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { listNotifications } from "@/features/notifications/queries"

/**
 * Client feed endpoint for the notification bell + /notifications page.
 * Notification state is never cached (Requirements §48) — hence no-store.
 * `userId` rides along so the client can subscribe to its Pusher channel
 * without a second session call.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const limitRaw = url.searchParams.get("limit")
  const limit = limitRaw ? Number(limitRaw) : undefined

  const page = await listNotifications(user.id, {
    cursor: url.searchParams.get("cursor"),
    limit: Number.isFinite(limit) ? limit : undefined,
  })

  return NextResponse.json(
    { userId: user.id, ...page },
    { headers: { "cache-control": "no-store" } }
  )
}
