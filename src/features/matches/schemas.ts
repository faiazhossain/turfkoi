import { z } from "zod"

import { FORMATS, isValidSquadSize, MATCH_FORMATS } from "./formats"

export const createMatchSchema = z.object({
  bookingId: z.string().uuid(),
  // Optional: a match can be created solo — the booker becomes the captain
  // and recruits players afterwards.
  teamId: z.string().uuid().optional(),
  // Played format (on-field count per side) — chosen in the wizard.
  matchType: z.enum(["fives", "sevens", "nines", "elevens"]),
  // Total squad per side INCLUDING substitutes; format never caps this.
  squadSize: z.number().int(),
  // Count-first: how many un-named players the captain already has ("আমার ৭
  // জন আছে") — stored as placeholders, identities fill in later from the
  // match room. Excludes the creator (always on the roster).
  placeholderCount: z
    .number()
    .int()
    .min(0)
    .max(FORMATS.elevens.maxSquad - 1)
    .optional(),
})
  .refine((d) => isValidSquadSize(d.matchType, d.squadSize), {
    message: "matches.errors.squadSizeInvalid",
    path: ["squadSize"],
  })
export type CreateMatchValues = z.infer<typeof createMatchSchema>

export const submitResultSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
})
export type SubmitResultValues = z.infer<typeof submitResultSchema>

export { FORMATS, MATCH_FORMATS }
export type { MatchFormat } from "./formats"
