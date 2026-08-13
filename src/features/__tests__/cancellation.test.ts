import { describe, it, expect } from "vitest"

import { computeRefund } from "@/lib/cancellation"

/**
 * J5 — negative-path tests for the per-turf-owner cancellation policy.
 * Covers the rejection cases a happy-path E2E would miss: strict → no refund,
 * moderate inside the no-refund window, rebook_contingent not-yet-rebooked,
 * flexible past the cutoff, and a negative (post-kickoff) hours-to-kickoff.
 */
describe("computeRefund — negative paths", () => {
  const turfAmount = 1000

  it("strict policy never refunds", () => {
    const r = computeRefund(turfAmount, {
      cancellationPolicy: "strict",
      cancellationPolicyConfig: null,
    }, 48)
    expect(r.refundAmount).toBe(0)
    expect(r.keepAmount).toBe(1000)
  })

  it("flexible past cutoff refunds nothing", () => {
    const r = computeRefund(turfAmount, {
      cancellationPolicy: "flexible",
      cancellationPolicyConfig: { cutoffHours: 24 },
    }, 2)
    expect(r.refundAmount).toBe(0)
  })

  it("moderate inside smallest tier refunds nothing", () => {
    const r = computeRefund(turfAmount, {
      cancellationPolicy: "moderate",
      cancellationPolicyConfig: {
        tiers: [{ withinHours: 24, refundPercent: 50 }],
      },
    }, 1)
    expect(r.refundAmount).toBe(0)
    expect(r.keepAmount).toBe(1000)
  })

  it("rebook_contingent with no rebook refunds nothing", () => {
    const r = computeRefund(turfAmount, {
      cancellationPolicy: "rebook_contingent",
      cancellationPolicyConfig: null,
    }, 48, false)
    expect(r.refundAmount).toBe(0)
  })

  it("negative hours-to-kickoff (post-kickoff) is clamped to 0", () => {
    const r = computeRefund(turfAmount, {
      cancellationPolicy: "flexible",
      cancellationPolicyConfig: { cutoffHours: 0 },
    }, -3)
    // cutoff 0 + clamped hours 0 → still meets the cutoff (>= 0), full refund.
    // This proves the clamp works without leaking a partial / negative refund.
    expect(r.refundAmount).toBe(1000)
  })

  it("moderate refunds 0 inside the smallest tier, applies above each threshold, full above the largest", () => {
    const cfg = {
      cancellationPolicy: "moderate" as const,
      cancellationPolicyConfig: {
        tiers: [
          { withinHours: 24, refundPercent: 50 },
          { withinHours: 48, refundPercent: 80 },
        ],
      },
    }
    // hours=20: cancelling inside the 24h window — no tier threshold met → 0.
    expect(computeRefund(turfAmount, cfg, 20).refundAmount).toBe(0)
    // hours=30: meets the 24h threshold (50%) but not 48h.
    expect(computeRefund(turfAmount, cfg, 30).refundAmount).toBe(500)
    // hours=50: above the largest threshold → full refund.
    expect(computeRefund(turfAmount, cfg, 50).refundAmount).toBe(1000)
  })
})
