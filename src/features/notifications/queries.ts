import "server-only"

import { and, count, desc, eq, isNull, lt, or } from "drizzle-orm"

import { db } from "@/db"
import { notifications } from "@/db/schema"

/**
 * Notification reads. Never cached (Requirements §48). Keyset pagination on
 * (createdAt, id) — the notifications_user_created_idx covers the sort.
 */

export interface NotificationItem {
  id: string
  type: string
  priority: string
  payload: unknown
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationPage {
  items: NotificationItem[]
  nextCursor: string | null
  unreadCount: number
}

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return Number(rows[0]?.n ?? 0)
}

/**
 * List a page of a user's notifications, newest first. `cursor` is opaque —
 * `${createdAtISO}|${id}` of the last item of the previous page.
 */
export async function listNotifications(
  userId: string,
  opts: { cursor?: string | null; limit?: number } = {}
): Promise<NotificationPage> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const unreadCount = await getUnreadNotificationCount(userId)

  const where = opts.cursor ? cursorPredicate(opts.cursor) : undefined

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      priority: notifications.priority,
      payload: notifications.payload,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(where ? and(eq(notifications.userId, userId), where) : eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)

  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      payload: r.payload,
      entityType: r.entityType,
      entityId: r.entityId,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor:
      hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    unreadCount,
  }
}

function cursorPredicate(cursor: string) {
  const sep = cursor.lastIndexOf("|")
  if (sep <= 0) return undefined
  const createdAt = new Date(cursor.slice(0, sep))
  const id = cursor.slice(sep + 1)
  if (Number.isNaN(createdAt.getTime()) || !id) return undefined
  return or(
    lt(notifications.createdAt, createdAt),
    and(eq(notifications.createdAt, createdAt), lt(notifications.id, id))
  )
}
