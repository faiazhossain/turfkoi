import { z } from "zod"

import { TURF_FORMAT_VALUES } from "./formats"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Preset facility toggles + owner-added custom entries (customName -> true),
// kept through validation via the catchall so jsonb round-trips them.
export const facilitiesSchema = z
  .object({
    indoor: z.boolean().optional(),
    outdoor: z.boolean().optional(),
    grassType: z.string().max(40).optional(),
    lighting: z.boolean().optional(),
    parking: z.boolean().optional(),
    changingRoom: z.boolean().optional(),
    shower: z.boolean().optional(),
    washroom: z.boolean().optional(),
    equipment: z.boolean().optional(),
  })
  .catchall(z.boolean().or(z.string().max(60)))
  .optional()

export const coordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const cancellationPolicyConfigSchema = z
  .object({
    cutoffHours: z.number().int().positive().optional(),
    tiers: z
      .array(
        z.object({
          withinHours: z.number().int().positive(),
          refundPercent: z.number().min(0).max(100),
        })
      )
      .optional(),
  })
  .optional()

export const turfFormSchema = z.object({
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
  cancellationPolicy: z.enum([
    "flexible",
    "moderate",
    "rebook_contingent",
    "strict",
  ]),
  cancellationPolicyConfig: cancellationPolicyConfigSchema,
  facilities: facilitiesSchema,
})
export type TurfFormValues = z.infer<typeof turfFormSchema>

// Slot generation: pick a date range + weekdays + a window of N back-to-back
// slots of equal duration at a base price. The action materializes one row
// per (date, startTime) into turf_slots.
export const generateSlotsSchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "booking.errors.dateFormat"),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "booking.errors.dateFormat"),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, "turfOwner.errors.pickAtLeastOneDay")
      .max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "booking.errors.timeFormat"),
    durationMinutes: z.union([z.literal(60), z.literal(90)]),
    slotsPerDay: z.number().int().min(1).max(24),
    basePrice: z
      .number()
      .positive("turfOwner.errors.pricePositive")
      .max(100000, "turfOwner.errors.priceTooHigh"),
  })
  .refine((v) => v.dateTo >= v.dateFrom, {
    message: "turfOwner.errors.endDateAfter",
    path: ["dateTo"],
  })
export type GenerateSlotsValues = z.infer<typeof generateSlotsSchema>

export const slotOverrideSchema = z.object({
  price: z
    .number()
    .positive()
    .max(100000)
    .optional(),
  status: z
    .enum(["available", "held", "booked", "maintenance", "blocked"])
    .optional(),
})
export type SlotOverrideValues = z.infer<typeof slotOverrideSchema>
