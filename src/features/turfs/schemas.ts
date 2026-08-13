import { z } from "zod"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const facilitiesSchema = z
  .object({
    indoor: z.boolean().optional(),
    grassType: z.string().max(40).optional(),
    lighting: z.boolean().optional(),
    parking: z.boolean().optional(),
    changingRoom: z.boolean().optional(),
    shower: z.boolean().optional(),
    washroom: z.boolean().optional(),
    equipment: z.boolean().optional(),
  })
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
  cancellationPolicy: z.enum([
    "flexible",
    "moderate",
    "rebook_contingent",
    "strict",
  ]),
  cancellationPolicyConfig: cancellationPolicyConfigSchema,
  facilities: facilitiesSchema,
  photos: z.array(z.string().url()).max(12),
})
export type TurfFormValues = z.infer<typeof turfFormSchema>

// Slot generation: pick a date range + weekdays + a window of N back-to-back
// slots of equal duration at a base price. The action materializes one row
// per (date, startTime) into turf_slots.
export const generateSlotsSchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Pick at least one day")
      .max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm (24h)"),
    durationMinutes: z.union([z.literal(60), z.literal(90)]),
    slotsPerDay: z.number().int().min(1).max(24),
    basePrice: z
      .number()
      .positive("Price must be positive")
      .max(100000, "Price looks too high"),
  })
  .refine((v) => v.dateTo >= v.dateFrom, {
    message: "End date must be on or after the start date",
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
