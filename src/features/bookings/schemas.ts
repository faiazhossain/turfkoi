import { z } from "zod"

export const holdSlotSchema = z.object({
  turfId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "booking.errors.dateFormat"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "booking.errors.timeFormat"),
})
export type HoldSlotValues = z.infer<typeof holdSlotSchema>

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})
export type CancelBookingValues = z.infer<typeof cancelBookingSchema>

export const markPayoutPaidSchema = z.object({
  payoutId: z.string().uuid(),
  providerReference: z
    .string()
    .min(4, "booking.errors.txnIdRequired")
    .max(80),
})
export type MarkPayoutPaidValues = z.infer<typeof markPayoutPaidSchema>
