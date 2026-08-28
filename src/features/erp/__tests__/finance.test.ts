import { describe, expect, it } from "vitest"

import {
  addMonthsToDate,
  addMonthsToMonth,
  daysUntil,
  monthOfDate,
  monthRange,
  nextDueDate,
  roundMoney,
  salaryPayable,
  salaryStatus,
  toNumericString,
  trialDaysLeft,
  weekdayOfDate,
} from "../finance"

describe("monthRange", () => {
  it("returns first and last day of the month", () => {
    expect(monthRange("2026-08")).toEqual({ from: "2026-08-01", to: "2026-08-31" })
  })

  it("handles February leap years", () => {
    expect(monthRange("2024-02").to).toBe("2024-02-29")
    expect(monthRange("2026-02").to).toBe("2026-02-28")
  })

  it("handles 30-day months", () => {
    expect(monthRange("2026-04").to).toBe("2026-04-30")
  })

  it("rejects invalid months", () => {
    expect(() => monthRange("2026-13")).toThrow()
    expect(() => monthRange("august")).toThrow()
  })
})

describe("month helpers", () => {
  it("monthOfDate slices the month", () => {
    expect(monthOfDate("2026-08-28")).toBe("2026-08")
  })

  it("addMonthsToMonth rolls over the year", () => {
    expect(addMonthsToMonth("2026-11", 2)).toBe("2027-01")
    expect(addMonthsToMonth("2026-01", -1)).toBe("2025-12")
  })

  it("addMonthsToDate clamps to the month's last day", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonthsToDate("2024-01-31", 1)).toBe("2024-02-29")
    expect(addMonthsToDate("2026-08-15", 1)).toBe("2026-09-15")
  })
})

describe("nextDueDate (recurring rules)", () => {
  it("advances monthly", () => {
    expect(nextDueDate("2026-08-05", "monthly")).toBe("2026-09-05")
  })

  it("advances quarterly and yearly", () => {
    expect(nextDueDate("2026-08-05", "quarterly")).toBe("2026-11-05")
    expect(nextDueDate("2026-08-05", "yearly")).toBe("2027-08-05")
  })

  it("keeps the day-of-month when it exists in the next month", () => {
    expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28")
  })
})

describe("daysUntil", () => {
  it("counts forward and backward", () => {
    expect(daysUntil("2026-08-31", "2026-08-28")).toBe(3)
    expect(daysUntil("2026-08-28", "2026-08-31")).toBe(-3)
    expect(daysUntil("2026-08-28", "2026-08-28")).toBe(0)
  })
})

describe("salary math (mirrors the erp_salary_records generated column)", () => {
  it("computes payable", () => {
    expect(
      salaryPayable({
        baseAmount: 15000,
        allowance: 1000,
        overtime: 500,
        bonus: 300,
        deduction: 200,
        advance: 0,
      })
    ).toBe(16600)
  })

  it("deducts and adds advances", () => {
    expect(
      salaryPayable({
        baseAmount: 10000,
        allowance: 0,
        overtime: 0,
        bonus: 0,
        deduction: 1500,
        advance: 2000,
      })
    ).toBe(10500)
  })

  it("avoids float drift", () => {
    expect(salaryPayable({
      baseAmount: 0.1, allowance: 0.2, overtime: 0, bonus: 0, deduction: 0, advance: 0,
    })).toBe(0.3)
  })

  it("derives status", () => {
    expect(salaryStatus(16000, 0)).toBe("pending")
    expect(salaryStatus(16000, 8000)).toBe("partial")
    expect(salaryStatus(16000, 16000)).toBe("paid")
  })

  it("never shows partial when overpaid", () => {
    expect(salaryStatus(16000, 16500)).toBe("paid")
  })
})

describe("money helpers", () => {
  it("roundMoney avoids drift", () => {
    expect(roundMoney(1.005)).toBe(1)
    expect(roundMoney(10.555)).toBe(10.56)
  })

  it("toNumericString formats for numeric(12,2)", () => {
    expect(toNumericString(1500)).toBe("1500.00")
    expect(toNumericString(0.1 + 0.2)).toBe("0.30")
  })
})

describe("trialDaysLeft", () => {
  it("counts remaining days, floored at 0", () => {
    const now = new Date("2026-08-28T10:00:00Z")
    expect(trialDaysLeft(new Date("2026-10-27T10:00:00Z"), now)).toBe(60)
    expect(trialDaysLeft(new Date("2026-08-28T09:00:00Z"), now)).toBe(0)
  })
})

describe("weekdayOfDate", () => {
  it("returns 0=Sunday..6=Saturday (UTC-safe)", () => {
    expect(weekdayOfDate("2026-08-28")).toBe(5) // Friday
    expect(weekdayOfDate("2026-08-30")).toBe(0) // Sunday
  })
})
