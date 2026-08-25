"use client"

import { formatDistanceToNow } from "date-fns"
import { BellIcon } from "lucide-react"
import type { ComponentType } from "react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import type { Translator } from "@/i18n/translate"
import { cn } from "@/lib/utils"

import type { NotificationDTO, NotificationsFeed } from "../hooks"
import { notificationPayloadSchemas } from "../schemas"
import { getNotificationConfig } from "../types"

interface Rendered {
  Icon: ComponentType<{ className?: string }>
  title: string
  body: string | null
  href?: string
}

/**
 * Render a row from its typed registry config. Unknown types or payloads
 * that fail zod validation (e.g. legacy rows) degrade to a generic entry
 * instead of crashing the list. Titles/bodies are dictionary keys resolved
 * through the active locale.
 */
function renderNotification(n: NotificationDTO, t: Translator): Rendered {
  const config = getNotificationConfig(n.type)
  const schema = notificationPayloadSchemas[n.type as keyof typeof notificationPayloadSchemas]
  const parsed = config && schema ? schema.safeParse(n.payload) : null
  if (config && parsed?.success) {
    const payload = parsed.data as never
    const title = config.title(payload)
    const body = config.body(payload)
    return {
      Icon: config.icon,
      title: t(title.key, title.params),
      body: body ? t(body.key, body.params) : null,
      href: config.href?.(payload),
    }
  }
  return { Icon: BellIcon, title: t("notifications.newNotification"), body: null }
}

const PRIORITY_TONE: Record<string, string> = {
  info: "text-muted-foreground",
  transactional: "text-primary",
  critical: "text-destructive",
}

export function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationDTO
  onOpen: (item: NotificationDTO, href?: string) => void
}) {
  const { t } = useI18n()
  const { Icon, title, body, href } = renderNotification(item, t)
  const unread = !item.readAt
  return (
    <button
      type="button"
      onClick={() => onOpen(item, href)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/60",
        unread && "bg-muted/40"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted",
          PRIORITY_TONE[item.priority] ?? PRIORITY_TONE.info
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-medium text-foreground" : "text-foreground/80"
            )}
          >
            {title}
          </span>
          {unread ? (
            <span
              className="ml-auto size-2 shrink-0 rounded-full bg-primary"
              aria-label={t("notifications.unreadAria")}
            />
          ) : null}
        </span>
        {body ? (
          <span className="block truncate text-xs text-muted-foreground">
            {body}
          </span>
        ) : null}
        <span className="block text-xs text-muted-foreground/70">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </span>
    </button>
  )
}

/**
 * Shared notification list for the bell dropdown and the /notifications
 * page. Loading shows skeleton rows (never a competing spinner); an absent
 * feed (still loading) is handled by the parent.
 */
export function NotificationList({
  feed,
  onOpen,
}: {
  feed: NotificationsFeed
  onOpen: (item: NotificationDTO, href?: string) => void
}) {
  const { t } = useI18n()

  if (feed.items.length === 0) {
    return (
      <EmptyState
        icon={BellIcon}
        title={t("notifications.emptyTitle")}
        description={t("notifications.emptyDesc")}
        className="border-none py-6"
      />
    )
  }

  return (
    <div className="space-y-1">
      {feed.items.map((item) => (
        <NotificationRow key={item.id} item={item} onOpen={onOpen} />
      ))}
      {feed.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          loading={feed.isFetchingNextPage}
          disabled={!feed.hasNextPage || feed.isFetchingNextPage}
          onClick={feed.fetchNextPage}
        >
          {t("notifications.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}
