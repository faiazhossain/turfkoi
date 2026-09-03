import { z } from "zod"

/**
 * Shared validation for manual bKash Send Money payment submissions
 * (wallet top-ups and turf bookings). The AMOUNT is never part of the client
 * input — it is recomputed server-side from the business rule.
 */

/** bKash TxIDs are alphanumeric; normalize for comparison/dedupe. */
export function normalizeTxId(value: string): string {
  return value.trim().toUpperCase()
}

export const submissionEvidenceSchema = z.object({
  transactionId: z.string().trim().min(4).max(60),
  senderNumber: z
    .string()
    .regex(/^01\d{9}$/, "payments.errors.invalidSenderNumber"),
  receiptPublicId: z
    .string()
    .regex(/^[a-zA-Z0-9/_-]+$/, "images.errors.invalidRef")
    .optional(),
  userNote: z.string().max(300).optional(),
})

export const reviewSubmissionSchema = z.object({
  id: z.string().uuid("errors.invalid"),
  decision: z.enum(["verify", "reject"]),
  rejectReason: z.string().max(300).optional(),
})
