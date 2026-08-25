"use client"

import { useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BellIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { NotificationDTO } from "../hooks"
import { useNotifications } from "../hooks"
import { NotificationList } from "./notification-list"

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
      aria-label={`${count} unread notifications`}
    >
      {count > 9 ? "9+" : count}
    </span>
  )
}

/**
 * Notification bell for signed-in users. Desktop: popover dropdown with the
 * latest items (SS16). Mobile bottom nav: `variant="link"` routes to the
 * full-screen /notifications center instead. Renders nothing when signed
 * out. The dropdown mounts the Pusher subscription (`realtime`), so toasts
 * and instant badge updates live here.
 */
export function NotificationBell({
  variant = "popover",
  className,
}: {
  variant?: "popover" | "link"
  className?: string
}) {
  const router = useRouter()
  const feed = useNotifications({ realtime: variant === "popover" })

  // Unread count is client-only (no server snapshot), and the feed fetch can
  // resolve before hydration finishes — gate it so the first client render
  // matches the server (0) and avoid a hydration mismatch.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const unreadCount = mounted ? feed.unreadCount : 0

  const onOpen = (item: NotificationDTO, href?: string) => {
    if (!item.readAt) feed.markRead(item.id)
    if (href) router.push(href)
  }

  if (feed.signedOut) return null

  if (variant === "link") {
    return (
      <Link
        href="/notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className={cn(
          "relative flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
          className
        )}
      >
        <BellIcon className="size-5" aria-hidden />
        <UnreadBadge count={unreadCount} />
      </Link>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          />
        }
        className="relative"
      >
        <BellIcon className="size-4" aria-hidden />
        <UnreadBadge count={unreadCount} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="text-sm font-medium">Notifications</p>
          {feed.unreadCount > 0 ? (
            <Button
              variant="link"
              size="xs"
              loading={feed.markAllPending}
              onClick={() => void feed.markAllRead()}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        {feed.isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <NotificationList feed={feed} onOpen={onOpen} />
          </div>
        )}
        <div className="border-t border-border pt-1 mt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            render={<Link href="/notifications" />}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
