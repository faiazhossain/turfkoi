import { z } from "zod"

import { isValidPhone } from "@/features/auth/phone"
import { coordsSchema } from "@/features/turfs/schemas"
import { TURF_FORMAT_VALUES } from "@/features/turfs/formats"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Public "list my turf" application. Deliberately low-friction: no account
 * needed, WhatsApp phone is the required contact channel. The admin verifies
 * everything before the turf goes live.
 */
export const turfApplicationSchema = z.object({
  turfName: z.string().min(2, "ownATurf.errors.turfNameShort").max(80),
  contactName: z.string().min(2, "ownATurf.errors.contactShort").max(60),
  phone: z
    .string()
    .refine(isValidPhone, "auth.errors.phone_invalid"),
  // Optional, but the input submits "" when left blank — normalize that to
  // undefined before validating so an empty field doesn't fail email parsing.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v))
    .pipe(z.email("auth.errors.email_invalid").optional()),
  city: z.string().max(80).optional(),
  area: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  // Optional owner pin — admin verifies at approval.
  coords: coordsSchema.optional(),
})
export type TurfApplicationValues = z.infer<typeof turfApplicationSchema>

/**
 * Admin approval payload: the seed data for the turf created from an
 * application. Same shape as seedTurfSchema (the turf-claims seed), minus
 * description, plus the application being approved.
 */
export const approveApplicationSchema = z.object({
  applicationId: z.string().uuid(),
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
export type ApproveApplicationValues = z.infer<typeof approveApplicationSchema>

export const rejectApplicationSchema = z.object({
  applicationId: z.string().uuid(),
})
