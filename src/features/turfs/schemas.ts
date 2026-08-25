import { z } from "zod"

import { findSectionConflicts } from "@/lib/slot-expansion"

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
  name: z.string().min(2, "Name is too short").max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(slugRegex, "Use lowercase letters, digits, and hyphens"),
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

// Slot system P1: shared slot length validation. BD turfs run 45/60/75/90/120
// min games; anything from 30 to 180 minutes in 5-minute steps fits a real
// venue (Jamuna Future Park's first slot starts 11:05 — odd shapes are normal).
export const slotMinutesSchema = z
  .number()
  .int("Use whole minutes")
  .min(30, "Minimum 30 minutes")
  .max(180, "Maximum 180 minutes")
  .refine((v) => v % 5 === 0, "Use a multiple of 5 minutes")

const hhmmSchema = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm (24h)")

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
    startTime: hhmmSchema,
    durationMinutes: slotMinutesSchema,
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

// One section of a weekly schedule day: "Evening 17:00-23:00, 90 min +10 gap,
// 1200". endTime before startTime wraps past midnight (Ramadan night hours).
export const scheduleSectionSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    label: z.string().max(30, "Keep labels short").optional(),
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    slotMinutes: slotMinutesSchema,
    // No zod default: RHF's resolver types would split on input/output.
    // Callers always send an explicit gap (0 for back-to-back).
    gapMinutes: z.number().int().min(0).max(30),
    price: z
      .number()
      .positive("Price must be positive")
      .max(100000, "Price looks too high"),
  })
  .refine((v) => v.endTime !== v.startTime, {
    message: "End time must differ from start time (wrap earlier for night hours)",
    path: ["endTime"],
  })
export type ScheduleSectionValues = z.infer<typeof scheduleSectionSchema>

export const saveScheduleSchema = z
  .object({
    // Present = edit that schedule; absent = create a new one.
    scheduleId: z.string().uuid().optional(),
    name: z.string().min(1, "Name the schedule").max(60),
    isActive: z.boolean(),
    sections: z
      .array(scheduleSectionSchema)
      .min(1, "Add at least one section")
      .max(70, "Too many sections (max 10 per day)"),
  })
  .superRefine((v, ctx) => {
    for (const conflict of findSectionConflicts(v.sections)) {
      ctx.addIssue({ code: "custom", message: conflict, path: ["sections"] })
    }
  })
export type SaveScheduleValues = z.infer<typeof saveScheduleSchema>

// Per-turf booking window: how far ahead the schedule keeps bookable slots
// materialized. The weekly schedule repeats forever regardless.
export const BOOKING_HORIZON_CHOICES = [7, 14, 30, 60, 90] as const
export const bookingHorizonSchema = z.union(
  BOOKING_HORIZON_CHOICES.map((d) => z.literal(d))
)
export type BookingHorizonDays = z.infer<typeof bookingHorizonSchema>

// Custom single-slot add (Layer 3): one hand-placed slot on one date.
export const addSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  startTime: hhmmSchema,
  durationMinutes: slotMinutesSchema,
  price: z
    .number()
    .positive("Price must be positive")
    .max(100000, "Price looks too high"),
})
export type AddSlotValues = z.infer<typeof addSlotSchema>

// Date exception (Layer 2): close a date (Eid, rain, maintenance) and/or
// set a holiday price rule for it. isClosed and a price rule are mutually
// exclusive — a closed turf has nothing to price.
export const dateExceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    isClosed: z.boolean(),
    reason: z.string().max(80, "Keep the reason short").optional(),
    priceMode: z.enum(["multiplier", "absolute"]).optional(),
    priceValue: z.number().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.isClosed && (v.priceMode || v.priceValue !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "A closed day can't also carry a price rule",
        path: ["priceMode"],
      })
      return
    }
    if (!v.isClosed) {
      if (!v.priceMode && v.priceValue === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Either close the day or set a price rule",
          path: ["isClosed"],
        })
        return
      }
      if (v.priceMode && v.priceValue === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Provide the value for the price rule",
          path: ["priceValue"],
        })
        return
      }
      if (v.priceMode === "multiplier") {
        if (
          v.priceValue === undefined ||
          !Number.isFinite(v.priceValue) ||
          v.priceValue < 0.5 ||
          v.priceValue > 3
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Multiplier must be between 0.5 and 3",
            path: ["priceValue"],
          })
        }
      }
      if (v.priceMode === "absolute") {
        if (
          v.priceValue === undefined ||
          !Number.isFinite(v.priceValue) ||
          v.priceValue < 1 ||
          v.priceValue > 100000
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Price must be between 1 and 100000",
            path: ["priceValue"],
          })
        }
      }
    }
  })
export type DateExceptionValues = z.infer<typeof dateExceptionSchema>

export const clearDateExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
})

// P3.1: activate a saved schedule, optionally for an effective window.
// Null bounds = runs from activation (or forever). The window is what makes
// "Ramadan hours, Feb 19 - Mar 20" a one-tap seasonal switch.
export const activateScheduleSchema = z
  .object({
    scheduleId: z.string().uuid(),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullable()
      .optional(),
    effectiveTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .refine((v) => !v.effectiveFrom || !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    message: "End date must be on or after the start date",
    path: ["effectiveTo"],
  })
export type ActivateScheduleValues = z.infer<typeof activateScheduleSchema>

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
