import { redirect } from "next/navigation"
import { UsersIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { AddStaffSheet, DeactivateStaffButton } from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"

import { listStaff } from "@/features/erp/queries"

export default async function ErpStaffPage() {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const staff = await listStaff(user.id)
  const active = staff.filter((s) => s.status === "active")

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("erp.staff.count", { count: active.length })}
          </p>
          <p className="text-xs text-muted-foreground">{t("erp.staff.limitHint")}</p>
        </div>
        <AddStaffSheet />
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={t("erp.staff.empty")}
          description={t("erp.staff.emptyBody")}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {staff.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-heading text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      `erp.staff.positions.${s.position === "other" && s.positionOther ? "other" : s.position}`
                    )}
                    {s.position === "other" && s.positionOther ? ` · ${s.positionOther}` : ""}
                  </p>
                  {s.phone ? (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{s.phone}</p>
                  ) : null}
                </div>
                <StatusBadge
                  status={s.status === "active" ? "success" : "neutral"}
                >
                  {t(`erp.staff.status.${s.status}`)}
                </StatusBadge>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    {t(`erp.staff.salaryTypes.${s.salaryType}`)}
                  </span>{" "}
                  <span className="font-semibold tabular-nums">
                    {formatBdt(Number(s.baseSalary))}
                  </span>
                </p>
                {s.status === "active" ? <DeactivateStaffButton id={s.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
