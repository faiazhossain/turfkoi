"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { initiateWalletTopUpAction } from "@/features/wallet/actions"
import { cn } from "@/lib/utils"

const AMOUNTS = [50, 100, 250, 500]

/** bKash top-up: preset amount chips + initiate → redirect to checkout. */
export function TopUpButton() {
  const { t } = useI18n()
  const [amount, setAmount] = useState<number>(AMOUNTS[0])
  const [pending, start] = useTransition()

  function topUp() {
    start(async () => {
      const res = await initiateWalletTopUpAction({ amount })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      if (!res.paymentUrl) {
        toast.error(t("errors.generic"))
        return
      }
      // bKash checkout (dev: the mock confirm route) lives off-app.
      window.location.href = res.paymentUrl
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("wallet.topupAmount")}>
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={amount === a}
            onClick={() => setAmount(a)}
            className={cn(
              "match-score rounded-xl border px-2 py-2.5 text-sm font-bold transition",
              amount === a
                ? "border-dt-green bg-dt-green/10 text-dt-green"
                : "border-dt-line bg-dt-card text-dt-dim hover:bg-dt-card2"
            )}
          >
            ৳{a}
          </button>
        ))}
      </div>
      <Button onClick={topUp} loading={pending} className="match-btn-lime w-full border-0">
        {t("wallet.topup")}
      </Button>
    </div>
  )
}
