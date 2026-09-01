"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared"
import {
  generateWeeklyPayoutsAction,
  markPayoutPaidAction,
} from "@/features/bookings/actions"
import { useI18n } from "@/i18n/client"

interface Payout {
  id: string
  turfOwnerId: string
  amount: string
  periodStart: string
  periodEnd: string
  status: "pending" | "scheduled" | "paid" | "failed"
  providerReference: string | null
  createdAt: Date
  paidAt: Date | null
}

/**
 * Admin payouts surface. Phase 3 ships the minimum to run the money flow:
 * generate weekly payouts + mark paid after the manual bKash send-money.
 * The deeper dispute / dual-control UI lands in Phase 7 (H4).
 */
export function PayoutsPanel({
  payouts,
  periodStart,
  periodEnd,
}: {
  payouts: Payout[]
  periodStart: string
  periodEnd: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [payingId, setPayingId] = useState<string | null>(null)
  const [ref, setRef] = useState("")

  function generate() {
    start(async () => {
      const res = await generateWeeklyPayoutsAction(periodStart, periodEnd)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("admin.payouts.generatedToast", { count: res.count ?? 0 }))
      router.refresh()
    })
  }

  function markPaid(payoutId: string) {
    start(async () => {
      const res = await markPayoutPaidAction({ payoutId, providerReference: ref })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("admin.payouts.markedPaidToast"))
      setPayingId(null)
      setRef("")
      router.refresh()
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t("admin.payouts.title")}</h2>
          <p className="text-sm text-dt-dim">
            {t("admin.payouts.period", { start: periodStart, end: periodEnd })}
          </p>
        </div>
        <Button onClick={generate} loading={pending}>
          {t("admin.payouts.generate")}
        </Button>
      </div>

      {payouts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.payouts.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
          {payouts.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-dt-card p-3 text-sm"
            >
              <div>
                <p className="font-mono text-xs text-dt-dim">
                  {p.periodStart} → {p.periodEnd}
                </p>
                <p className="font-semibold tabular-nums">
                  ৳{Number(p.amount).toLocaleString()}
                </p>
                {p.providerReference ? (
                  <p className="text-xs text-dt-dim">
                    bKash: {p.providerReference}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={p.status === "paid" ? "success" : "warning"}
                  showIcon={false}
                >
                  {t(`admin.payouts.status.${p.status}`)}
                </StatusBadge>
                {p.status === "pending" ? (
                  payingId === p.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={ref}
                        onChange={(e) => setRef(e.target.value)}
                        placeholder={t("admin.payouts.trxIdPlaceholder")}
                        className="w-32"
                      />
                      <Button
                        size="sm"
                        onClick={() => markPaid(p.id)}
                        loading={pending}
                        disabled={ref.length < 4}
                      >
                        {t("common.confirm")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPayingId(null)
                          setRef("")
                        }}
                        disabled={pending}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPayingId(p.id)}
                    >
                      {t("admin.payouts.markPaid")}
                    </Button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
