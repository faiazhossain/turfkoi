import { z } from "zod"

import { isValidPhone } from "@/features/auth/phone"
import { coordsSchema } from "@/features/turfs/schemas"
import { TURF_FORMAT_VALUES } from "@/features/turfs/formats"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Admin-seeded turf basics. Deliberately minimal — the owner completes the
 * full listing (photos, slots, policy) after claiming. Everything except
 * name, slug, coords, and format is optional at seed time.
 */
export const seedTurfSchema = z.object({
  name: z.string().min(2, "turfOwner.errors.nameShort").max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(slugRegex, "team.errors.slugFormat"),
  description: z.string().max(2000).optional(),
  coords: coordsSchema,
  format: z.enum(TURF_FORMAT_VALUES),
  city: z.string().max(80).optional(),
  area: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
})
export type SeedTurfValues = z.infer<typeof seedTurfSchema>

export const createInviteSchema = z.object({
  turfId: z.string().uuid(),
  targetEmail: z.string().email().optional(),
  // When set, the invite carries a one-time OTP and the claim page offers
  // the WhatsApp OTP login flow.
  targetPhone: z
    .string()
    .refine(isValidPhone, "auth.errors.phone_invalid")
    .optional(),
})
export type CreateInviteValues = z.infer<typeof createInviteSchema>

export const claimOtpSchema = z.object({
  token: z.string().min(20).max(100),
  code: z.string().length(6, "claim.errors.codeLength"),
})
export type ClaimOtpValues = z.infer<typeof claimOtpSchema>

export const claimPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "claim.errors.passwordMin")
    .max(72, "claim.errors.passwordMax"),
})
export type ClaimPasswordValues = z.infer<typeof claimPasswordSchema>

export const claimTurfSchema = z.object({
  token: z.string().min(20).max(100),
})
export type ClaimTurfValues = z.infer<typeof claimTurfSchema>
