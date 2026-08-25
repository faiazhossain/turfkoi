import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/db"
import { notifications, userRoles } from "@/db/schema"
import { logger } from "@/lib/logger"
import { publish } from "@/lib/realtime"

import { getNotificationConfig } from "./types"
import {
  buildNotificationRows,
  type CreateNotificationParams,
} from "./rows"

export type { CreateNotificationParams }

/**
 * Create in-app notifications for a set of users and push a realtime event
 * per user (audit G4: server publishes, clients subscribe). Best-effort by
 * design: a notification failure must never fail the host mutation (booking
 * confirmation, application approval) — everything is caught and logged.
 */
export async function createNotifications(
  params: CreateNotificationParams,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return
  try {
    await db.insert(notifications).values(buildNotificationRows(params, userIds))

    // Realtime payload carries localized key/params so clients can render the
    // badge/toast in the active locale without a refetch.
    const config = getNotificationConfig(params.type)
    if (config) {
      const payload = params.payload as Record<string, unknown>
      const title = config.title(payload as never)
      const body = config.body(payload as never)
      const href = config.href?.(payload as never)
      await Promise.all(
        userIds.map((userId) =>
          publish(`user-${userId}`, "notification.new", {
            type: params.type,
            priority: config.priority,
            title,
            body,
            href,
          })
        )
      )
    }
  } catch (err) {
    logger.warn("notifications.create_failed", {
      type: params.type,
      recipients: userIds.length,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Fan a notification out to every user holding the admin role. */
export async function notifyAdmins(params: CreateNotificationParams): Promise<void> {
  try {
    const admins = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, "admin"))
    await createNotifications(
      params,
      admins.map((a) => a.userId)
    )
  } catch (err) {
    logger.warn("notifications.notify_admins_failed", {
      type: params.type,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
