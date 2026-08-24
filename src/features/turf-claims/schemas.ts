import { z } from "zod"

import { coordsSchema } from "@/features/turfs/schemas"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Admin-seeded turf basics. Deliberately minimal — the owner completes the
 * full listing (photos, slots, policy) after claiming. Everything except
 * name, slug, coords, and format is optional at seed time.
 */
export const seedTurfSchema = z.object({
  name: z.string().min(2, "Name is too short").max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(slugRegex, "Use lowercase letters, digits, and hyphens"),
  description: z.string().max(2000).optional(),
  coords: coordsSchema,
  format: z.enum(["fives", "sevens"]),
  city: z.string().max(80).optional(),
  area: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
})
export type SeedTurfValues = z.infer<typeof seedTurfSchema>

export const createInviteSchema = z.object({
  turfId: z.string().uuid(),
  targetEmail: z.string().email().optional(),
})
export type CreateInviteValues = z.infer<typeof createInviteSchema>

export const claimTurfSchema = z.object({
  token: z.string().min(20).max(100),
})
export type ClaimTurfValues = z.infer<typeof claimTurfSchema>
