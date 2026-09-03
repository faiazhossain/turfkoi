"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"

import { reviewPaymentSubmissionAction } from "@/features/payments/actions"

/**
 * Admin controls on a pending payment submission: verify (consumes the
 * submission AND applies the business effect) or reject with a mandatory
 * inline reason. Same interaction pattern as the ERP premium review.
 */
export function PaymentSubmissionReview({ submissionId }: { submissionId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  function review(decision: "verify" | "reject", rejectReason?: string) {
    setError(null)
    startTransition(async () => {
      const res = await reviewPaymentSubmissionAction({
        id: submissionId,
        decision,
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
          placeholder={t("admin.payments.rejectReasonLabel")}
          className="h-8 w-48"
        />
        <Button
          size="xs"
          variant="destructive"
          loading={pending}
          disabled={reason.trim().length === 0}
          onClick={() => review("reject", reason)}
        >
          {t("admin.payments.reject")}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setRejecting(false)}>
          {t("booking.keepBooking")}
        </Button>
        {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="xs" loading={pending} onClick={() => review("verify")}>
        {t("admin.payments.verify")}
      </Button>
      <Button size="xs" variant="outline" onClick={() => setRejecting(true)}>
        {t("admin.payments.reject")}
      </Button>
      {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}
    </div>
  )
}
