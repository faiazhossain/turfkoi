import { z } from "zod"

export const createMatchSchema = z.object({
  bookingId: z.string().uuid(),
  // Optional: a match can be created solo — the booker becomes the captain
  // and recruits players afterwards.
  teamId: z.string().uuid().optional(),
})
export type CreateMatchValues = z.infer<typeof createMatchSchema>

export const submitResultSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
})
export type SubmitResultValues = z.infer<typeof submitResultSchema>

// Roster limits per format (Q7): 5v5 = 5 starters + 3 subs (min 5);
// 7v7 = 7 + 4 subs (min 7).
export const ROSTER_LIMITS: Record<string, { min: number; max: number }> = {
  fives: { min: 5, max: 8 },
  sevens: { min: 7, max: 11 },
}
