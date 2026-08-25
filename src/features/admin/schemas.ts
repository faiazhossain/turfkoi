import { z } from "zod"

export const verifyTurfSchema = z.object({
  turfId: z.string().uuid(),
})
export type VerifyTurfValues = z.infer<typeof verifyTurfSchema>

export const unverifyTurfSchema = z.object({
  turfId: z.string().uuid(),
})
export type UnverifyTurfValues = z.infer<typeof unverifyTurfSchema>

export const setTurfActiveSchema = z.object({
  turfId: z.string().uuid(),
  isActive: z.boolean(),
})
export type SetTurfActiveValues = z.infer<typeof setTurfActiveSchema>

export const setUserStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
})
export type SetUserStatusValues = z.infer<typeof setUserStatusSchema>

export const setUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "turf_owner", "team_owner", "player"]),
  on: z.boolean(),
})
export type SetUserRoleValues = z.infer<typeof setUserRoleSchema>

export const requestRefundSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z
    .number()
    .min(0, "Refund amount must be positive")
    .max(1_000_000, "Refund amount is unreasonably large"),
  reason: z.string().max(500).optional(),
})
export type RequestRefundValues = z.infer<typeof requestRefundSchema>

export const approveRefundSchema = z.object({
  refundRequestId: z.string().uuid(),
})
export type ApproveRefundValues = z.infer<typeof approveRefundSchema>

export const rejectRefundSchema = z.object({
  refundRequestId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})
export type RejectRefundValues = z.infer<typeof rejectRefundSchema>

export const resolveMatchDisputeSchema = z.object({
  matchId: z.string().uuid(),
  decision: z.enum(["confirm", "scratch"]),
  homeScore: z.number().int().min(0).max(99).optional(),
  awayScore: z.number().int().min(0).max(99).optional(),
  notes: z.string().max(500).optional(),
})
export type ResolveMatchDisputeValues = z.infer<typeof resolveMatchDisputeSchema>

export const updateReportStatusSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["pending", "reviewing", "resolved", "dismissed"]),
})
export type UpdateReportStatusValues = z.infer<typeof updateReportStatusSchema>
