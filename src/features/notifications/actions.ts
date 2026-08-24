"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { notifications } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

const idSchema = z.string().uuid()

/**
 * Mark one notification read. Ownership is enforced in the WHERE clause, so
 * marking another user's notification is a silent no-op (no existence leak).
 */
export async function markNotificationReadAction(
  id: string
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: "Invalid notification." }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You are not signed in." }

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data),
        eq(notifications.userId, user.id),
        isNull(notifications.readAt)
      )
    )

  revalidatePath("/notifications")
  return { ok: true }
}

/** Mark every unread notification of the current user as read. */
export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You are not signed in." }

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))

  revalidatePath("/notifications")
  return { ok: true }
}
