"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"

import {
  adminGrantPremiumAction,
  reviewPremiumRequestAction,
} from "@/features/erp/premium-actions"

export function ReviewButtons({ requestId }: { requestId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  function review(approve: boolean, rejectReason?: string) {
    setError(null)
    startTransition(async () => {
      const res = await reviewPremiumRequestAction({
        id: requestId,
        approve,
        rejectReason,
      })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  if (rejecting) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("erp.premiumAdmin.rejectPlaceholder")}
          className="h-8 w-48"
        />
        <Button
          size="xs"
          variant="destructive"
          loading={pending}
          disabled={reason.trim().length === 0}
          onClick={() => review(false, reason)}
        >
          {t("erp.premiumAdmin.reject")}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setRejecting(false)}>
          {t("erp.premiumAdmin.cancel")}
        </Button>
        {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="xs" loading={pending} onClick={() => review(true)}>
        {t("erp.premiumAdmin.approve")}
      </Button>
      <Button size="xs" variant="outline" onClick={() => setRejecting(true)}>
        {t("erp.premiumAdmin.reject")}
      </Button>
      {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}
    </div>
  )
}

export function GrantPremiumControl({
  owners,
}: {
  owners: { ownerId: string; label: string }[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [ownerId, setOwnerId] = useState<string>(owners[0]?.ownerId ?? "")
  const [months, setMonths] = useState("1")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={ownerId} onValueChange={(v) => setOwnerId(v ?? "")}>
        <SelectTrigger className="h-9 w-56">
          <SelectValue>
            {owners.find((o) => o.ownerId === ownerId)?.label ??
              t("erp.premiumAdmin.grantTitle")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {owners.map((o) => (
            <SelectItem key={o.ownerId} value={o.ownerId}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={months} onValueChange={(v) => setMonths(v ?? "1")}>
        <SelectTrigger className="h-9 w-28">
          <SelectValue>
            {t("erp.premiumAdmin.months", { months })}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {["1", "3", "6", "12"].map((m) => (
            <SelectItem key={m} value={m}>
              {t("erp.premiumAdmin.months", { months: m })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        loading={pending}
        disabled={!ownerId}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await adminGrantPremiumAction({
              ownerId,
              months: Number(months),
            })
            if (!res.ok) setError(res.error)
            else router.refresh()
          })
        }
      >
        {t("erp.premiumAdmin.grant")}
      </Button>
      {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}
    </div>
  )
}
