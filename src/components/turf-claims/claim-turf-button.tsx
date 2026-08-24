"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared"

import { claimTurfAction } from "@/features/turf-claims/actions"

export function ClaimTurfButton({ token }: { token: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClaim() {
    setError(null)
    setPending(true)
    const res = await claimTurfAction(token)
    if (!res.ok) {
      setError(res.error)
      setPending(false)
      return
    }
    router.replace(`/turf-owner/turfs/${res.id}`)
  }

  return (
    <div className="space-y-3">
      {error ? <StatusBadge status="danger">{error}</StatusBadge> : null}
      <Button size="lg" loading={pending} onClick={onClaim}>
        {pending ? "Claiming" : "Claim this turf"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Claiming makes you this turf&apos;s owner on Turfkoi — you&apos;ll set
        up slots, pricing, and photos next.
      </p>
    </div>
  )
}
