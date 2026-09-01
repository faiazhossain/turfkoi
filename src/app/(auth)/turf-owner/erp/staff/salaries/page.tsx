import Link from "next/link"
import { redirect } from "next/navigation"
import { BanknoteIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { MonthNav } from "@/components/erp"
import { SalaryAdjustSheet, SalaryPaySheet } from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"

import { monthOfDate } from "@/features/erp/finance"
import { getSalaryMonth } from "@/features/erp/queries"

const STATUS_MAP = {
  pending: "warning",
  partial: "info",
  paid: "success",
} as const

export default async function ErpSalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const t = await getT()
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : monthOfDate(todayInDhaka())
  const rows = await getSalaryMonth(user.id, month)

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} basePath="/turf-owner/erp/staff/salaries" />
        <p className="text-sm text-dt-dim">{t("erp.salaries.subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BanknoteIcon}
          title={t("erp.salaries.empty")}
          description={t("erp.salaries.emptyBody")}
          action={
            <Link
              href="/turf-owner/erp/staff"
              className="inline-flex h-9 items-center rounded-lg bg-dt-green px-4 text-sm font-medium text-dt-ink"
            >
              {t("erp.staff.addStaff")}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const remaining = Math.max(0, Math.round((r.payable - r.paidAmount) * 100) / 100)
            return (
              <li
                key={r.staffId}
                className="rounded-xl border border-dt-line bg-dt-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-heading text-sm font-semibold">{r.staffName}</p>
                    <p className="mt-1 text-sm tabular-nums">
                      <span className="text-dt-dim">{t("erp.salaries.payable")}:</span>{" "}
                      <span className="font-semibold">{formatBdt(r.payable)}</span>
                      {r.paidAmount > 0 ? (
                        <span className="text-dt-dim">
                          {" "}
                          · {t("erp.salaries.paid")}: {formatBdt(r.paidAmount)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={STATUS_MAP[r.status]}>
                      {t(`erp.salaries.status.${r.status}`)}
                    </StatusBadge>
                    <SalaryAdjustSheet
                      staffId={r.staffId}
                      staffName={r.staffName}
                      month={month}
                      baseAmount={r.components.baseAmount}
                      baseSalary={r.baseSalary}
                    />
                    {remaining > 0 ? (
                      <SalaryPaySheet
                        staffId={r.staffId}
                        staffName={r.staffName}
                        month={month}
                        remaining={remaining}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
