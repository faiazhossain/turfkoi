import "server-only"
import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { friendships, users, playerProfiles } from "@/db/schema"

export type FriendRow = {
  friendshipId: string
  userId: string
  name: string | null
  phone: string
  avatarType: string | null
  avatarPresetId: string | null
  avatarPublicId: string | null
}

/** Accepted friends of the user, both directions, with profile display fields. */
export async function listFriends(userId: string): Promise<FriendRow[]> {
  const rows = await db
    .select({
      friendshipId: friendships.id,
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      friendId: users.id,
      name: users.name,
      phone: users.phone,
      avatarType: playerProfiles.avatarType,
      avatarPresetId: playerProfiles.avatarPresetId,
      avatarPublicId: playerProfiles.avatarPublicId,
    })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
        and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId))
      )
    )
    .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))
      )
    )
    .orderBy(asc(users.name))

  return rows.map((r) => ({
    friendshipId: r.friendshipId,
    userId: r.friendId,
    name: r.name,
    phone: r.phone,
    avatarType: r.avatarType,
    avatarPresetId: r.avatarPresetId,
    avatarPublicId: r.avatarPublicId,
  }))
}

export type PendingRequestRow = {
  friendshipId: string
  userId: string
  name: string | null
  phone: string
  avatarType: string | null
  avatarPresetId: string | null
  avatarPublicId: string | null
}

/** Friend requests the user has RECEIVED (they are the addressee). */
export async function listPendingFriendRequests(userId: string): Promise<PendingRequestRow[]> {
  const rows = await db
    .select({
      friendshipId: friendships.id,
      userId: users.id,
      name: users.name,
      phone: users.phone,
      avatarType: playerProfiles.avatarType,
      avatarPresetId: playerProfiles.avatarPresetId,
      avatarPublicId: playerProfiles.avatarPublicId,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .leftJoin(playerProfiles, eq(playerProfiles.userId, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")))
    .orderBy(desc(friendships.createdAt))
  return rows
}

/**
 * Candidate suggestions: players recently marked available (24h freshness),
 * excluding the user. Friends are filtered out by the client.
 */
export async function listFriendCandidates(userId: string, limit = 10) {
  return db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
    })
    .from(playerProfiles)
    .innerJoin(users, eq(users.id, playerProfiles.userId))
    .where(
      and(
        ne(users.id, userId),
        eq(playerProfiles.available, true),
        sql`${playerProfiles.availableAt} >= now() - interval '24 hours'`
      )
    )
    .limit(limit)
}

/** Search registered players by name/phone prefix for the friend search box. */
export async function searchUsersForFriend(userId: string, q: string, limit = 8) {
  const term = `%${q}%`
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
    })
    .from(users)
    .where(and(ne(users.id, userId), or(ilike(users.name, term), ilike(users.phone, term))))
    .limit(limit)
  return rows
}

/** Relationship state between the user and a target (for row buttons). */
export async function getFriendshipState(
  userId: string,
  otherId: string
): Promise<"none" | "self" | "friends" | "outgoing" | "incoming"> {
  if (userId === otherId) return "self"
  const rows = await db
    .select({
      status: friendships.status,
      requesterId: friendships.requesterId,
      id: friendships.id,
    })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, otherId)),
        and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, userId))
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row) return "none"
  if (row.status === "accepted") return "friends"
  return row.requesterId === userId ? "outgoing" : "incoming"
}
