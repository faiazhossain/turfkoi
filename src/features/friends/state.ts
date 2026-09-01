/**
 * Pure friendship/blocks state machine (Player Network). Kept free of DB and
 * server-only imports so vitest can exercise every edge directly.
 */

export type FriendshipStatus = "pending" | "accepted" | "declined"

export interface FriendshipRowLike {
  id: string
  status: FriendshipStatus
  requesterId: string
  addresseeId: string
}

export type FriendshipState =
  | "none"
  | "self"
  | "friends"
  | "outgoing"
  | "incoming"
  | "blocked"

/** Relationship between viewer and other given the (optional) friendship row + block flag. */
export function resolveFriendshipState(
  viewerId: string,
  otherId: string,
  row: FriendshipRowLike | null | undefined,
  blocked: boolean
): FriendshipState {
  if (viewerId === otherId) return "self"
  if (blocked) return "blocked"
  if (!row) return "none"
  if (row.status === "accepted") return "friends"
  return row.requesterId === viewerId ? "outgoing" : "incoming"
}

/** Whether sending a friend request is allowed, else the dictionary error key. */
export function requestSendBlocker(
  state: FriendshipState
): { ok: true } | { ok: false; error: string } {
  switch (state) {
    case "self":
      return { ok: false, error: "friends.errors.selfRequest" }
    case "friends":
      return { ok: false, error: "friends.errors.alreadyFriends" }
    case "outgoing":
      return { ok: false, error: "friends.errors.requestPending" }
    case "incoming":
      return { ok: false, error: "friends.errors.requestIncoming" }
    case "blocked":
      return { ok: false, error: "friends.errors.blocked" }
    default:
      return { ok: true }
  }
}

/** Match invites (and friend requests) are impossible in either block direction. */
export function filterBlockedInvitees<T extends { userId: string }>(
  targets: T[],
  blockedUserIds: Set<string>
): T[] {
  return targets.filter((t) => !blockedUserIds.has(t.userId))
}
