import { z } from "zod"

import { isValidPhone, normalizePhone } from "@/features/auth/phone"
import { FIELD_POSITION_IDS } from "@/features/player/positions"

import { FORMATS, isValidSquadSize, MATCH_FORMATS } from "./formats"

export const createMatchSchema = z.object({
  bookingId: z.string().uuid(),
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

export const claimOpponentSideSchema = z.object({
  matchId: z.string().uuid(),
  // Count-first: how many players the claimant brings, themselves included.
  // Stored as themselves + away placeholders; bounded per side in the action.
  playerCount: z
    .number()
    .int({ message: "matches.errors.claimCountInvalid" })
    .min(1, "matches.errors.claimCountInvalid")
    .max(FORMATS.elevens.maxSquad, "matches.errors.claimCountInvalid"),
})
export type ClaimOpponentSideValues = z.infer<typeof claimOpponentSideSchema>

export const submitResultSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
})
export type SubmitResultValues = z.infer<typeof submitResultSchema>

/** "" / whitespace-only from an empty form field means "not given". */
const emptyToUndefined = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema)

export const addGuestSchema = z.object({
  matchId: z.string().uuid(),
  name: z.string().trim().min(1, "errors.invalid").max(60, "errors.invalid"),
  // Stored normalized (+8801XXXXXXXXX) so the registered-user check and the
  // signup link in linkMatchInvitationsAndGuests match users.phone exactly.
  phone: emptyToUndefined(
    z
      .string()
      .transform(normalizePhone)
      .refine(isValidPhone, "matches.errors.phoneInvalid")
      .optional()
  ),
  // Guests record a real position — "any" is an availability flag, not a
  // position, so it is not offered here (unset stays null).
  position: emptyToUndefined(
    z.enum(FIELD_POSITION_IDS, "matches.errors.guestPositionInvalid").optional()
  ),
  // Numeric strings coerce so a stray form value still validates; anything
  // non-numeric fails with the dictionary key (never Zod's English default,
  // which would leak into a toast).
  jerseyNumber: z.preprocess(
    (v) => {
      if (v === undefined || (typeof v === "string" && v.trim() === "")) {
        return undefined
      }
      if (typeof v === "string") return Number(v.trim())
      return v
    },
    z
      .number({ message: "matches.errors.guestJerseyInvalid" })
      .int({ message: "matches.errors.guestJerseyInvalid" })
      .min(0, "matches.errors.guestJerseyInvalid")
      .max(99, "matches.errors.guestJerseyInvalid")
      .optional()
  ),
})
export type AddGuestValues = z.infer<typeof addGuestSchema>

export { FORMATS, MATCH_FORMATS }
export type { MatchFormat } from "./formats"
