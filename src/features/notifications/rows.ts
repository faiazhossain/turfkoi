import { NOTIFICATION_TYPES, type NotificationType } from "./types"

/**
 * Pure row-shaping for notification inserts — kept free of server-only/db
 * imports so Vitest can test it directly.
 */

export type CreateNotificationParams = {
  [K in NotificationType]: {
    type: K
    payload: unknown
    entityType?: string
    entityId?: string
  }
}[NotificationType]

export interface NotificationRow {
  userId: string
  type: NotificationType
  priority: string
  payload: unknown
  entityType: string | null
  entityId: string | null
}

/** Fan a single notification out to one row per recipient user. */
export function buildNotificationRows(
  params: CreateNotificationParams,
  userIds: string[]
): NotificationRow[] {
  const priority = NOTIFICATION_TYPES[params.type].priority
  return userIds.map((userId) => ({
    userId,
    type: params.type,
    priority,
    payload: params.payload,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
  }))
}
