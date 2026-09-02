import { describe, expect, it } from "vitest"

import {
  TOPUP_MAX_BDT,
  TOPUP_MIN_BDT,
  awayFeeKey,
  claimableBalance,
  feeBackKey,
  homeFeeKey,
  isTopupAmountValid,
  shouldCreditMatchFees,
} from "./logic"

describe("isTopupAmountValid", () => {
  it("accepts whole-taka amounts inside the bounds", () => {
    expect(isTopupAmountValid(TOPUP_MIN_BDT)).toBe(true)
    expect(isTopupAmountValid(500)).toBe(true)
    expect(isTopupAmountValid(TOPUP_MAX_BDT)).toBe(true)
  })

  it("rejects out-of-bounds and fractional amounts", () => {
    expect(isTopupAmountValid(TOPUP_MIN_BDT - 1)).toBe(false)
    expect(isTopupAmountValid(TOPUP_MAX_BDT + 1)).toBe(false)
    expect(isTopupAmountValid(100.5)).toBe(false)
    expect(isTopupAmountValid(0)).toBe(false)
    expect(isTopupAmountValid(Number.NaN)).toBe(false)
  })
})

describe("shouldCreditMatchFees", () => {
  it("credits fall-through states only", () => {
    expect(shouldCreditMatchFees("cancelled")).toBe(true)
    expect(shouldCreditMatchFees("expired")).toBe(true)
    expect(shouldCreditMatchFees("completed")).toBe(false)
    expect(shouldCreditMatchFees("disputed")).toBe(false)
    expect(shouldCreditMatchFees("open")).toBe(false)
  })
})

describe("idempotency keys", () => {
  it("keys fees per match and payer so holds never leak across matches", () => {
    expect(homeFeeKey("m1")).toBe("fee_home_m1")
    expect(awayFeeKey("m1", "u1")).toBe("fee_away_m1_u1")
    expect(awayFeeKey("m2", "u1")).not.toBe(awayFeeKey("m1", "u1"))
    expect(awayFeeKey("m1", "u2")).not.toBe(awayFeeKey("m1", "u1"))
    expect(feeBackKey("m1", "u1")).toBe("fee_back_m1_u1")
  })
})

describe("claimableBalance", () => {
  it("a pending claim freezes the balance until it resolves", () => {
    expect(claimableBalance(100, true)).toBe(0)
    expect(claimableBalance(100, false)).toBe(100)
    expect(claimableBalance(-5, false)).toBe(0)
  })
})
