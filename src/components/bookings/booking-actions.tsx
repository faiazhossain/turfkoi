"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { cancelBookingAction } from "@/features/bookings/actions"

export interface BookingActionsProps {
  bookingId: string
  status: string
}

/**
 * Client-side orchestrator for the booking detail page — cancellation only.
 * Payment is handled by PaymentSubmissionForm (manual bKash + admin review).
 */
export function BookingActions({ bookingId, status }: BookingActionsProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  function cancel() {
    start(async () => {
      const res = await cancelBookingAction({ bookingId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        setConfirmingCancel(false)
        return
      }
      toast.success(
        typeof res.refundAmount === "number" && res.refundAmount > 0
          ? t("booking.cancelledRefundToast", {
              amount: res.refundAmount.toLocaleString(),
            })
          : t("booking.cancelledToast")
      )
      router.refresh()
    })
  }

  const canCancel = ["held", "payment_pending", "confirmed"].includes(status)

  if (!canCancel) return null

  return confirmingCancel ? (
    <div className="space-y-2 rounded-lg border border-dt-line bg-dt-card p-3 text-sm">
      <p className="font-medium">{t("booking.cancelTitle")}</p>
      <p className="text-dt-dim">{t("booking.cancelPolicyNote")}</p>
      <div className="flex gap-2">
        <Button
          onClick={cancel}
          loading={pending}
          variant="destructive"
          size="sm"
        >
          {t("booking.yesCancel")}
        </Button>
        <Button
          onClick={() => setConfirmingCancel(false)}
          disabled={pending}
          variant="ghost"
          size="sm"
        >
          {t("booking.keepBooking")}
        </Button>
      </div>
    </div>
  ) : (
    <Button
      onClick={() => setConfirmingCancel(true)}
      disabled={pending}
      variant="ghost"
      className="w-full"
    >
      {t("booking.cancelBooking")}
    </Button>
  )
}
