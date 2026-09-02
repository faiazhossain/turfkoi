"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SwordsIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"

import { Button } from "@/components/ui/button"
import { claimOpponentSideAction } from "@/features/matches/actions"

/**
 * Person-based opponent claim (replaces the team challenge): the claimant
 * declares how many players they bring (count-first, themselves included)
 * and becomes the away captain. FCFS — a race loser gets the "just taken"
 * error from the action's conditional update.
 */
export function ClaimOpponentButton({
  matchId,
  squadSize,
  size = "sm",
  canAffordFee = true,
}: {
  matchId: string
  squadSize: number
  size?: "sm" | "default"
  /** Server-checked wallet coverage of the ৳25 matchmaking fee. */
  canAffordFee?: boolean
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(1)
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))

  function claim() {
    start(async () => {
      const res = await claimOpponentSideAction({ matchId, playerCount: count })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.claim.successToast"))
      setOpen(false)
      router.refresh()
    })
  }

  if (!canAffordFee) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size={size} disabled>
          <SwordsIcon aria-hidden />
          {t("matches.claim.cta")}
        </Button>
        <span className="text-xs text-dt-dim">{t("wallet.errors.insufficientBalance")}</span>
        <a href="/app/wallet" className="text-xs font-medium text-dt-green hover:underline">
          {t("wallet.topup")}
        </a>
      </div>
    )
  }

  if (!open) {
    return (
      <Button size={size} onClick={() => setOpen(true)} disabled={pending}>
        <SwordsIcon aria-hidden />
        {t("matches.claim.cta")}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-dt-green/40 bg-dt-green/5 p-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={t("matches.wizard.decrease")}
        disabled={pending || count <= 1}
        onClick={() => setCount((n) => Math.max(1, n - 1))}
      >
        −
      </Button>
      <span
        key={count}
        className="min-w-8 animate-in text-center font-heading text-sm font-bold tabular-nums fade-in zoom-in-50 duration-150 motion-reduce:animate-none"
      >
        {num(count)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={t("matches.wizard.increase")}
        disabled={pending || count >= squadSize}
        onClick={() => setCount((n) => Math.min(squadSize, n + 1))}
      >
        +
      </Button>
      <Button size={size} onClick={claim} loading={pending}>
        {t("matches.claim.cta")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t("common.cancel")}
        disabled={pending}
        onClick={() => setOpen(false)}
      >
        ✕
      </Button>
    </div>
  )
}
