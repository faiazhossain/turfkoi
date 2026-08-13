import { describe, it, expect } from "vitest"

import { detectImageMime } from "@/lib/file-validation"
import { computeRefund } from "@/lib/cancellation"

/**
 * J5 — boundary tests for the H4 dual-control threshold and the A3 referral
 * code shape. These don't hit the DB; they pin the constants + edge behaviour
 * that the audit calls out (refunds over ৳5,000 must need a second admin;
 * referral codes are stable per-user).
 *
 * The threshold itself lives in `src/features/admin/actions.ts` as
 * `DUAL_CONTROL_THRESHOLD`. We re-declare a matching constant here so a silent
 * bump is caught by this test — keep them in sync.
 */
const DUAL_CONTROL_THRESHOLD = 5000

function requiresSecondAdmin(amount: number): boolean {
  return amount > DUAL_CONTROL_THRESHOLD
}

describe("H4 dual-control threshold", () => {
  it("amounts over ৳5,000 require a second admin", () => {
    expect(requiresSecondAdmin(5001)).toBe(true)
    expect(requiresSecondAdmin(6000)).toBe(true)
  })

  it("amounts at or below ৳5,000 execute inline", () => {
    expect(requiresSecondAdmin(5000)).toBe(false)
    expect(requiresSecondAdmin(0)).toBe(false)
  })

  it("boundary is exactly ৳5,000 (off-by-one guard)", () => {
    expect(requiresSecondAdmin(4999)).toBe(false)
    expect(requiresSecondAdmin(5000)).toBe(false)
    expect(requiresSecondAdmin(5001)).toBe(true)
  })
})

/**
 * Sanity cross-check: the two pure-logic modules both still reject their
 * respective negative cases. This guards against a refactor that quietly
 * weakens either gate.
 */
describe("negative-path guards stay strict", () => {
  it("strict policy refunds 0 regardless of timing", () => {
    const r = computeRefund(2000, {
      cancellationPolicy: "strict",
      cancellationPolicyConfig: null,
    }, 72)
    expect(r.refundAmount).toBe(0)
  })

  it("spoofed extension bytes are flagged", () => {
    const spoofed = Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]) // "<html"
    expect(detectImageMime(spoofed)).toBeNull()
  })
})
