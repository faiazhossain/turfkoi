import { describe, expect, it } from "vitest"

import { holdExpiryFor, SLOT_HOLD_TTL_MS } from "../slot-expansion"
import { normalizeTxId, submissionEvidenceSchema } from "@/features/payments/schemas"

describe("holdExpiryFor (manual bKash model)", () => {
  // 2026-09-03 12:00 Dhaka = 06:00 UTC.
  const kickoff = "2026-09-03" // date
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 8, 3, h - 6, m))

  it("gives the full 3h window when kickoff is far away", () => {
    const now = at(6, 0) // kickoff 20:00 → far future
    const expires = holdExpiryFor(kickoff, "20:00", now)
    expect(expires.getTime() - now.getTime()).toBe(SLOT_HOLD_TTL_MS)
  })

  it("clamps to kickoff − 20min when the slot starts within 3h", () => {
    const now = at(14, 0) // kickoff 16:00 → only 2h away
    const expires = holdExpiryFor(kickoff, "16:00", now)
    expect(expires.getTime()).toBe(at(15, 40).getTime())
  })

  it("is monotonically never past the booking cutoff", () => {
    const now = at(15, 30) // kickoff 16:00, cutoff 15:40
    const expires = holdExpiryFor(kickoff, "16:00", now)
    expect(expires.getTime()).toBe(at(15, 40).getTime())
  })
})

describe("payment submission validation", () => {
  it("normalizes TxIDs for dedupe (trim + uppercase)", () => {
    expect(normalizeTxId("  ab12cd34 ")).toBe("AB12CD34")
  })

  it("rejects malformed sender numbers", () => {
    const res = submissionEvidenceSchema.safeParse({
      transactionId: "AB12CD34",
      senderNumber: "12345",
    })
    expect(res.success).toBe(false)
  })

  it("accepts a well-formed submission", () => {
    const res = submissionEvidenceSchema.safeParse({
      transactionId: "AB12CD34",
      senderNumber: "01712345678",
      receiptPublicId: "deshiturf/receipts/u1/img",
      userNote: "sent at 9pm",
    })
    expect(res.success).toBe(true)
  })
})
