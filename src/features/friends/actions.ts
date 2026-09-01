"use server"

import { revalidatePath } from "next/cache"
import { and, eq, or } from "drizzle-orm"

import { db } from "@/db"
import { friendships, userBlocks, users } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { createNotifications } from "@/features/notifications/create"
import {
  sendFriendRequestSchema,
  respondFriendRequestSchema,
  removeFriendSchema,
  blockUserSchema,
  friendSearchSchema,
} from "./schemas"
import { searchUsersForFriend, isBlockedEitherDirection } from "./queries"

/** Search registered users for the friend picker (server action wrapper). */
export async function searchUsersForFriendAction(q: string) {
  const parsed = friendSearchSchema.safeParse({ q })
  if (!parsed.success) return []
  const user = await getCurrentUser()
  if (!user) return []
  return searchUsersForFriend(user.id, parsed.data.q)
}

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Send a friend request. Blocks self-requests, duplicates, and the
 * reverse-pending case (if the other side already requested, accept theirs
 * instead — surfaced to the caller as an error with a clear key).
 */
export async function sendFriendRequestAction(
  input: { userId: string }
): Promise<ActionResult> {
  const parsed = sendFriendRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }
  const targetId = parsed.data.userId
  if (targetId === user.id) return { ok: false, error: "friends.errors.selfRequest" }

  const [target] = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1)
  if (!target) return { ok: false, error: "friends.errors.userNotFound" }
  if (await isBlockedEitherDirection(user.id, targetId)) {
    return { ok: false, error: "friends.errors.blocked" }
  }

  const existing = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, targetId)),
        and(eq(friendships.requesterId, targetId), eq(friendships.addresseeId, user.id))
      )
    )
    .limit(1)
  const prior = existing[0]
  if (prior) {
    if (prior.status === "accepted") return { ok: false, error: "friends.errors.alreadyFriends" }
    if (prior.status === "pending") {
      // They asked first — accept their request instead of duplicating.
      if (prior.addresseeId === user.id) {
        await db
          .update(friendships)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(eq(friendships.id, prior.id))
        revalidatePath("/app")
        revalidatePath("/app/friends")
        return { ok: true }
      }
      return { ok: false, error: "friends.errors.requestPending" }
    }
    // Previously declined — allow re-request by flipping the row.
    await db
      .update(friendships)
      .set({ status: "pending", respondedAt: null, requesterId: user.id, addresseeId: targetId })
      .where(eq(friendships.id, prior.id))
  } else {
    await db.insert(friendships).values({
      requesterId: user.id,
      addresseeId: targetId,
    })
  }

  const [me] = await db
    .select({ name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  await createNotifications(
    {
      type: "friend.request_received",
      payload: { friendName: me?.name ?? me?.phone ?? "" },
      entityType: "user",
      entityId: targetId,
    },
    [targetId]
  )

  revalidatePath("/app")
  revalidatePath("/app/friends")
  return { ok: true }
}

/** Accept or decline a received friend request. Only the addressee responds. */
export async function respondToFriendRequestAction(
  input: { friendshipId: string; accept: boolean }
): Promise<ActionResult> {
  const parsed = respondFriendRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const [row] = await db
    .select()
    .from(friendships)
    .where(eq(friendships.id, parsed.data.friendshipId))
    .limit(1)
  if (!row) return { ok: false, error: "friends.errors.requestNotFound" }
  if (row.addresseeId !== user.id) return { ok: false, error: "errors.noPermission" }
  if (row.status !== "pending") return { ok: false, error: "friends.errors.requestNotPending" }

  await db
    .update(friendships)
    .set({
      status: parsed.data.accept ? "accepted" : "declined",
      respondedAt: new Date(),
    })
    .where(eq(friendships.id, row.id))

  if (parsed.data.accept) {
    const [me] = await db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
    await createNotifications(
      {
        type: "friend.request_accepted",
        payload: { friendName: me?.name ?? me?.phone ?? "" },
        entityType: "user",
        entityId: row.requesterId,
      },
      [row.requesterId]
    )
  }

  revalidatePath("/app")
  revalidatePath("/app/friends")
  return { ok: true }
}

/** Remove a friend (or retract a pending request) — either side may. */
export async function removeFriendAction(
  input: { friendshipId: string }
): Promise<ActionResult> {
  const parsed = removeFriendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const [row] = await db
    .select()
    .from(friendships)
    .where(eq(friendships.id, parsed.data.friendshipId))
    .limit(1)
  if (!row) return { ok: false, error: "friends.errors.requestNotFound" }
  if (row.requesterId !== user.id && row.addresseeId !== user.id) {
    return { ok: false, error: "errors.noPermission" }
  }

  await db.delete(friendships).where(eq(friendships.id, row.id))
  revalidatePath("/app")
  revalidatePath("/app/friends")
  return { ok: true }
}

/**
 * Block a player (Player Network): kills any friendship/request between the
 * pair (either direction, any status) and prevents future friend requests +
 * match invites in both directions. Silent — the blocked player is not told.
 * neon-http has no transactions, so the statements are ordered idempotently.
 */
export async function blockUserAction(input: { userId: string }): Promise<ActionResult> {
  const parsed = blockUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }
  const targetId = parsed.data.userId
  if (targetId === user.id) return { ok: false, error: "friends.errors.selfRequest" }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1)
  if (!target) return { ok: false, error: "friends.errors.userNotFound" }

  await db.insert(userBlocks).values({ blockerId: user.id, blockedId: targetId }).onConflictDoNothing()
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, targetId)),
        and(eq(friendships.requesterId, targetId), eq(friendships.addresseeId, user.id))
      )
    )

  revalidatePath("/app")
  revalidatePath("/app/friends")
  revalidatePath("/players/[code]")
  return { ok: true }
}

/** Remove an existing block the user placed. The other side's block (if any) stays. */
export async function unblockUserAction(input: { userId: string }): Promise<ActionResult> {
  const parsed = blockUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, parsed.data.userId)))

  revalidatePath("/app")
  revalidatePath("/app/friends")
  revalidatePath("/players/[code]")
  return { ok: true }
}
