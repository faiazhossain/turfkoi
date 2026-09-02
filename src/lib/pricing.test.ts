import { describe, expect, it } from "vitest"

import { costShare, MATCH_FEE_BDT } from "./pricing"

describe("costShare", () => {
  it("splits a ৳3000 slot into half + matchmaking fee", () => {
    expect(costShare("3000.00")).toEqual({
      total: 3000,
      share: 1500,
      fee: MATCH_FEE_BDT,
      payable: 1525,
    })
  })

  it("accepts a numeric input", () => {
    expect(costShare(3000)).toEqual({
      total: 3000,
      share: 1500,
      fee: MATCH_FEE_BDT,
      payable: 1525,
    })
  })

  it("rounds the half up so the joining side never underpays", () => {
    const result = costShare(3001)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.share).toBe(1501)
      expect(result.payable).toBe(1526)
    }
  })

  it("rounds decimal strings to whole taka", () => {
    const result = costShare("3000.40")
    expect(result).not.toBeNull()
    if (result) expect(result.total).toBe(3000)
  })

  it("handles a ৳1 slot", () => {
    expect(costShare(1)).toEqual({
      total: 1,
      share: 1,
      fee: MATCH_FEE_BDT,
      payable: 26,
    })
  })

  it("returns null without a usable price", () => {
    expect(costShare(null)).toBeNull()
    expect(costShare("")).toBeNull()
    expect(costShare(0)).toBeNull()
    expect(costShare(-5)).toBeNull()
    expect(costShare("abc")).toBeNull()
  })
})
