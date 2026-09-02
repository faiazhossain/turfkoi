"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { decideWalletClaimAction } from "@/features/wallet/actions"

/**
 * Admin decision panel for one wallet cash claim: approve (opens the
 * 3-working-day payout window), mark paid (offline bKash executed), or
 * reject with an optional note (balance credited back).
 */
export function WalletClaimControls({ claimId }: { claimId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState("")

  function decide(decision: "approve" | "reject" | "markPaid") {
    start(async () => {
      const res = await decideWalletClaimAction({ claimId, decision, note: note || undefined })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(
        t(
          decision === "approve"
            ? "admin.walletClaims.approvedToast"
            : decision === "reject"
              ? "admin.walletClaims.rejectedToast"
              : "admin.walletClaims.paidToast"
        )
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        placeholder={t("admin.walletClaims.noteLabel")}
        className="h-9 w-full rounded-lg border border-dt-input bg-transparent px-3 text-sm outline-none placeholder:text-dt-dim"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => decide("approve")} loading={pending}>
          {t("admin.walletClaims.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decide("reject")}
          loading={pending}
        >
          {t("admin.walletClaims.reject")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decide("markPaid")}
          loading={pending}
        >
          {t("admin.walletClaims.markPaid")}
        </Button>
      </div>
    </div>
  )
}
