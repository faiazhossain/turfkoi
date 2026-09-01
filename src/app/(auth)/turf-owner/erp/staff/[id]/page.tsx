import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { getCurrentUser } from "@/lib/auth"
import { formatBdt } from "@/lib/pricing"
import { formatSlotDate } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

import { getSalaryHistory, getStaffById } from "@/features/erp/queries"

const STATUS_VARIANT = {
  pending: "warning",
  partial: "info",
  paid: "success",
} as const

export default async function ErpStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [t, locale, { id }] = await Promise.all([getT(), getLocale(), params])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const staff = await getStaffById(user.id, id)
  if (!staff) notFound()

  const history = await getSalaryHistory(user.id, id)

  return (
    <div className="mt-4 space-y-6">
      <Link
        href="/turf-owner/erp/staff"
        className="inline-flex items-center gap-1.5 text-sm text-dt-dim hover:text-dt-txt"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("erp.staff.title")}
      </Link>

      <header className="rounded-xl border border-dt-line bg-dt-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">{staff.name}</h2>
            <p className="text-sm text-dt-dim">
              {t(`erp.staff.positions.${staff.position}`)}
              {staff.positionOther ? ` · ${staff.positionOther}` : ""}
              {staff.phone ? ` · ${staff.phone}` : ""}
            </p>
            <p className="mt-1 text-sm">
              <span className="text-dt-dim">
                {t(`erp.staff.salaryTypes.${staff.salaryType}`)}
              </span>{" "}
              <span className="font-semibold tabular-nums">
                {formatBdt(Number(staff.baseSalary))}
              </span>
            </p>
          </div>
          <StatusBadge status={staff.status === "active" ? "success" : "neutral"}>
            {t(`erp.staff.status.${staff.status}`)}
          </StatusBadge>
        </div>
      </header>

      <section>
        <h3 className="mb-2 font-heading text-base font-semibold">
          {t("erp.salaries.title")}
        </h3>
        {history.length === 0 ? (
          <EmptyState
            title={t("erp.salaries.empty")}
            description={t("erp.salaries.emptyBody")}
          />
        ) : (
          <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line bg-dt-card">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{h.periodMonth.slice(0, 7)}</p>
                  {h.method ? (
                    <p className="text-xs text-dt-dim">
                      {t(`erp.salaries.methods.${h.method}`)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {formatBdt(Number(h.paidAmount))} / {formatBdt(Number(h.payable))}
                  </span>
                  <StatusBadge status={STATUS_VARIANT[h.status]}>
                    {t(`erp.salaries.status.${h.status}`)}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
