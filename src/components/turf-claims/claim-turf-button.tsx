"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useI18n } from "@/i18n/client"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared"

import { claimTurfAction } from "@/features/turf-claims/actions"

export function ClaimTurfButton({ token }: { token: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClaim() {
    setError(null)
    setPending(true)
    const res = await claimTurfAction(token)
    if (!res.ok) {
      setError(t(res.error ?? "errors.generic"))
      setPending(false)
      return
    }
    router.replace(`/turf-owner/turfs/${res.id}`)
  }

  return (
    <div className="space-y-3">
      {error ? <StatusBadge status="danger">{error}</StatusBadge> : null}
      <Button size="lg" loading={pending} onClick={onClaim}>
        {pending ? t("claim.claiming") : t("claim.claimButton")}
      </Button>
      <p className="text-xs text-dt-dim">{t("claim.claimNote")}</p>
    </div>
  )
}
