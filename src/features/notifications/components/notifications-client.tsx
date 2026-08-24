"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

import type { FeedPage, NotificationDTO } from "../hooks"
import { useNotifications } from "../hooks"
import { NotificationList } from "./notification-list"

/**
 * Full-screen notification center (SS16: mobile-first; the desktop entry
 * point is the header bell dropdown). The first page is server-rendered and
 * hydrated into the shared query, so there's no loading flash.
 */
export function NotificationsClient({ initial }: { initial: FeedPage }) {
  const router = useRouter()
  const feed = useNotifications({ initialData: initial })

  const onOpen = (item: NotificationDTO, href?: string) => {
    if (!item.readAt) feed.markRead(item.id)
    if (href) router.push(href)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Notifications</h1>
        {feed.unreadCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            loading={feed.markAllPending}
            onClick={() => void feed.markAllRead()}
          >
            Mark all read
          </Button>
        ) : null}
      </div>
      <NotificationList feed={feed} onOpen={onOpen} />
    </div>
  )
}
