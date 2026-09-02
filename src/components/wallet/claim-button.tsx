"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { requestWalletClaimAction } from "@/features/wallet/actions"

/** Cash-back claim: requests a payout of the full balance. */
export function ClaimButton({ disabled }: { disabled?: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()

  function claim() {
    start(async () => {
      const res = await requestWalletClaimAction()
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("wallet.claimRequested"))
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      onClick={claim}
      loading={pending}
      disabled={disabled}
      className="match-btn-outline w-full"
    >
      {t("wallet.claimButton")}
    </Button>
  )
}
