import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"

import { monthOfDate, monthRange } from "@/features/erp/finance"
import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"
import { listExpenses, listOtherIncome, getBookingRevenueByDay } from "@/features/erp/queries"
import { todayInDhaka } from "@/lib/slot-expansion"

const EXPORT_ROW_LIMIT = 1000

function csvResponse(filename: string, rows: (string | number)[][]) {
  // BOM so Excel renders the Bangla text correctly.
  const body = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** Server-side CSV export (premium/trial only). Scoped to the session owner;
 * free-tier owners get 403 and are pointed at the upgrade flow. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || !user.roles.includes("turf_owner")) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const plan = getErpPlanState(await ensureErpProfile(user.id))
  if (!plan.isPremiumFeaturesUnlocked) {
    return new NextResponse("Premium required", { status: 403 })
  }

  const url = new URL(request.url)
  const type = url.searchParams.get("type") === "income" ? "income" : "expenses"
  const monthParam = url.searchParams.get("month") ?? ""
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : monthOfDate(todayInDhaka())
  const { from, to } = monthRange(month)

  if (type === "expenses") {
    const rows = await listExpenses(user.id, from, to, EXPORT_ROW_LIMIT)
    return csvResponse(`expenses-${month}`, [
      ["Date", "Amount BDT", "Category", "Vendor", "Note", "Source"],
      ...rows.map((r) => [
        r.date,
        Number(r.amount).toFixed(2),
        r.categoryName,
        r.vendor ?? "",
        r.note ?? "",
        r.source,
      ]),
    ])
  }

  const [otherIncome, bookingDays] = await Promise.all([
    listOtherIncome(user.id, from, to, EXPORT_ROW_LIMIT),
    getBookingRevenueByDay(user.id, from, to),
  ])
  return csvResponse(`income-${month}`, [
    ["Date", "Amount BDT", "Source", "Note"],
    ...bookingDays.map((d) => [d.date, Number(d.revenue).toFixed(2), "booking", ""]),
    ...otherIncome.map((r) => [
      r.date,
      Number(r.amount).toFixed(2),
      r.source,
      r.note ?? "",
    ]),
  ])
}
