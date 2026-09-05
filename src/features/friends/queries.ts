import "server-only"
import { and, asc, desc, eq, ne, notExists, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { friendships, userBlocks, users, playerProfiles } from "@/db/schema"

/** SQL that filters out rows where `other` is blocked in EITHER direction. */
export function notBlockedEitherDirection(viewerId: string, other: typeof users.id) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, other)),
          and(eq(userBlocks.blockerId, other), eq(userBlocks.blockedId, viewerId))
        )
      )
  )
}

export type FriendRow = {
  friendshipId: string
  userId: string
  name: string | null
  phone: string
  playerId: string | null
  username: string | null
  position: string | null
  lastSeenAt: Date | null
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
      playerId: playerProfiles.playerId,
      username: playerProfiles.username,
      position: playerProfiles.position,
      lastSeenAt: playerProfiles.lastSeenAt,
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
    playerId: r.playerId,
    username: r.username,
    position: r.position,
    lastSeenAt: r.lastSeenAt,
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

/** Friend requests the user has SENT that are still pending (Player Network "Sent" tab). */
export async function listSentFriendRequests(userId: string): Promise<PendingRequestRow[]> {
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
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .leftJoin(playerProfiles, eq(playerProfiles.userId, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "pending")))
    .orderBy(desc(friendships.createdAt))
  return rows
}

export type FriendCandidateRow = {
  userId: string
  name: string | null
  phone: string
  playerId: string | null
  username: string | null
  position: string | null
  area: string | null
  avatarType: string | null
  avatarPresetId: string | null
  avatarPublicId: string | null
  /** Set only when the viewer has profile coords (10 km radius search). */
  distanceKm: number | null
  lat: number | null
  lng: number | null
}

/**
 * Candidate suggestions: players recently marked available (24h freshness),
 * excluding the user, blocked pairs, and anyone with an existing friendship
 * or pending request in either direction. When the viewer has profile coords,
 * only players within 10 km are returned (SS20/SS32 radius), nearest first;
 * otherwise suggestions are unfiltered by distance, most recently available
 * first. Pins stay approximate — coords are rounded to ~110m at write time.
 */
export async function listFriendCandidates(
  userId: string,
  opts: { limit?: number; origin?: { lat: number; lng: number } | null } = {}
): Promise<FriendCandidateRow[]> {
  const { limit = 10, origin } = opts
  const originPoint = origin
    ? sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography`
    : null
  const distanceExpr = sql<number>`ST_Distance(${playerProfiles.coords}, ${originPoint}) / 1000.0`

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      phone: users.phone,
      playerId: playerProfiles.playerId,
      username: playerProfiles.username,
      position: playerProfiles.position,
      area: playerProfiles.area,
      avatarType: playerProfiles.avatarType,
      avatarPresetId: playerProfiles.avatarPresetId,
      avatarPublicId: playerProfiles.avatarPublicId,
      lat: sql<number | null>`ST_Y(${playerProfiles.coords}::geometry)`,
      lng: sql<number | null>`ST_X(${playerProfiles.coords}::geometry)`,
      distanceKm: originPoint
        ? distanceExpr
        : sql<number | null>`NULL::double precision`,
    })
    .from(playerProfiles)
    .innerJoin(users, eq(users.id, playerProfiles.userId))
    .where(
      and(
        ne(users.id, userId),
        eq(playerProfiles.available, true),
        sql`${playerProfiles.availableAt} >= now() - interval '24 hours'`,
        notBlockedEitherDirection(userId, users.id),
        notExists(
          db
            .select({ one: sql`1` })
            .from(friendships)
            .where(
              or(
                and(
                  eq(friendships.requesterId, userId),
                  eq(friendships.addresseeId, users.id)
                ),
                and(
                  eq(friendships.addresseeId, userId),
                  eq(friendships.requesterId, users.id)
                )
              )
            )
        ),
        // 10 km radius from the viewer when their coords are known (SS20).
        ...(originPoint
          ? [sql`ST_DWithin(${playerProfiles.coords}, ${originPoint}, 10000)`]
          : [])
      )
    )
    .orderBy(
      originPoint
        ? asc(distanceExpr)
        : desc(playerProfiles.availableAt)
    )
    .limit(limit)

  return rows.map((r) => ({
    ...r,
    distanceKm: r.distanceKm == null ? null : Number(r.distanceKm),
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
  }))
}

/** True when a block row exists between the two users in EITHER direction. */
export async function isBlockedEitherDirection(
  userId: string,
  otherId: string
): Promise<boolean> {
  const rows = await db
    .select({ one: sql`1` })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherId)),
        and(eq(userBlocks.blockerId, otherId), eq(userBlocks.blockedId, userId))
      )
    )
    .limit(1)
  return rows.length > 0
}

/** Direction of the block between viewer/target, null when not blocked. */
export async function getBlockDirection(
  viewerId: string,
  otherId: string
): Promise<"byViewer" | "onViewer" | null> {
  const rows = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, otherId)),
        and(eq(userBlocks.blockerId, otherId), eq(userBlocks.blockedId, viewerId))
      )
    )
    .limit(1)
  if (rows.length === 0) return null
  return rows[0].blockerId === viewerId ? "byViewer" : "onViewer"
}

/** Id of the accepted friendship row between the pair, else null. */
export async function getFriendshipIdBetween(
  userId: string,
  otherId: string
): Promise<string | null> {
  if (userId === otherId) return null
  const rows = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, otherId)),
          and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, userId))
        )
      )
    )
    .limit(1)
  return rows[0]?.id ?? null
}

/** Ids of users `userId` has blocked, or who have blocked `userId`. */
export async function getBlockedIdsEitherDirection(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)))
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))
}

/** Relationship state between the user and a target (for row buttons). */
export async function getFriendshipState(
  userId: string,
  otherId: string
): Promise<"none" | "self" | "friends" | "outgoing" | "incoming" | "blocked"> {
  if (userId === otherId) return "self"
  const blocked = await isBlockedEitherDirection(userId, otherId)
  if (blocked) return "blocked"
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
