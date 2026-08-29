import { redirect } from "next/navigation"
import { ReceiptTextIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import {
  AddBillSheet,
  DeactivateRuleButton,
  MarkBillPaidButton,
  RentContractSheet,
} from "@/components/erp"
import { getCurrentUser } from "@/lib/auth"
import { todayInDhaka } from "@/lib/slot-expansion"
import { formatBdt } from "@/lib/pricing"
import { formatSlotDate } from "@/lib/format-date"
import { getLocale, getT } from "@/i18n/server"

import { countActiveRules, getRentContract, listCategories, listRules } from "@/features/erp/queries"

const FREE_RULE_LIMIT = 3

export default async function ErpBillsPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const today = todayInDhaka()
  const [categories, rules, activeRules, rentContract] = await Promise.all([
    listCategories(user.id),
    listRules(user.id),
    countActiveRules(user.id),
    getRentContract(user.id),
  ])
  // Salary is managed by the Salaries module (auto-posts its own expense);
  // offering it here would double-count staff costs.
  const categoryOptions = categories
    .filter((c) => !(c.isSystem && c.slug === "staff_salary"))
    .map((c) => ({
      id: c.id,
      label: c.isSystem ? t(`erp.categories.${c.slug}`) : c.name,
    }))

  const active = rules.filter((r) => r.isActive)
  const inactive = rules.filter((r) => !r.isActive)
  const upcoming = active.filter((r) => r.daysUntilDue !== null && r.daysUntilDue <= 30)

  function dueChip(daysUntilDue: number | null) {
    if (daysUntilDue === null) return null
    if (daysUntilDue < 0)
      return (
        <StatusBadge status="danger">
          {t("erp.bills.overdue", { days: Math.abs(daysUntilDue) })}
        </StatusBadge>
      )
    if (daysUntilDue === 0)
      return <StatusBadge status="warning">{t("erp.bills.dueToday")}</StatusBadge>
    return (
      <StatusBadge status="info">{t("erp.bills.dueIn", { days: daysUntilDue })}</StatusBadge>
    )
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t("erp.bills.subtitle")}</p>
          <p className="text-xs text-muted-foreground">{t("erp.bills.ruleLimit")}</p>
        </div>
        <AddBillSheet categories={categoryOptions} today={today} />
      </div>

      {rentContract ? (
        <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-semibold">{t("erp.rent.title")}</h2>
              <p className="mt-1 text-sm tabular-nums">
                <span className="font-semibold">{formatBdt(Number(rentContract.monthlyAmount))}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("erp.bills.frequencies.monthly").toLowerCase()}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {rentContract.landlordName ?? ""}
                {rentContract.agreementStart
                  ? ` · ${formatSlotDate(rentContract.agreementStart, locale)}`
                  : ""}
                {rentContract.agreementEnd
                  ? ` → ${formatSlotDate(rentContract.agreementEnd, locale)}`
                  : ""}
              </p>
              {Number(rentContract.securityDeposit) > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("erp.rent.deposit")}:{" "}
                  {formatBdt(Number(rentContract.securityDeposit))}
                </p>
              ) : null}
            </div>
            <RentContractSheet
              existing={{
                monthlyAmount: Number(rentContract.monthlyAmount),
                landlordName: rentContract.landlordName,
                landlordPhone: rentContract.landlordPhone,
                agreementStart: rentContract.agreementStart,
                agreementEnd: rentContract.agreementEnd,
                securityDeposit: Number(rentContract.securityDeposit),
                note: rentContract.note,
              }}
            />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-semibold">{t("erp.rent.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("erp.rent.emptyBody")}</p>
            </div>
            <RentContractSheet existing={null} />
          </div>
        </section>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={ReceiptTextIcon}
          title={t("erp.bills.empty")}
          description={t("erp.bills.emptyBody")}
        />
      ) : (
        <>
          {upcoming.length > 0 ? (
            <section>
              <h2 className="mb-2 font-heading text-base font-semibold">
                {t("erp.bills.upcoming")}
              </h2>
              <ul className="space-y-2">
                {upcoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatSlotDate(r.nextDueDate, locale)} ·{" "}
                        {t(`erp.bills.frequencies.${r.frequency}`)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {dueChip(r.daysUntilDue)}
                      <span className="font-semibold tabular-nums">
                        {formatBdt(r.amount)}
                      </span>
                      <MarkBillPaidButton id={r.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 font-heading text-base font-semibold">
              {t("erp.bills.allRules")}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {active.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.categorySlug ? t(`erp.categories.${r.categorySlug}`) : r.categoryName}{" "}
                      · {t(`erp.bills.frequencies.${r.frequency}`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatBdt(r.amount)}</span>
                    <DeactivateRuleButton id={r.id} />
                  </div>
                </li>
              ))}
              {inactive.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 opacity-60"
                >
                  <p className="text-sm">{r.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {t("erp.bills.deactivate")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
