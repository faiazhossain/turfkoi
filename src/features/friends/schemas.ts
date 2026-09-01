import { z } from "zod"

export const sendFriendRequestSchema = z.object({
  /** The user to befriend. */
  userId: z.string().uuid(),
})
export type SendFriendRequestValues = z.infer<typeof sendFriendRequestSchema>

export const respondFriendRequestSchema = z.object({
  friendshipId: z.string().uuid(),
  accept: z.boolean(),
})
export type RespondFriendRequestValues = z.infer<typeof respondFriendRequestSchema>

export const removeFriendSchema = z.object({
  friendshipId: z.string().uuid(),
})
export type RemoveFriendValues = z.infer<typeof removeFriendSchema>

export const blockUserSchema = z.object({
  /** The user to block (or unblock). */
  userId: z.string().uuid(),
})
export type BlockUserValues = z.infer<typeof blockUserSchema>

/** Find users for the friend search (name/phone prefix). */
export const friendSearchSchema = z.object({
  q: z.string().trim().min(2).max(50),
})
export type FriendSearchValues = z.infer<typeof friendSearchSchema>
