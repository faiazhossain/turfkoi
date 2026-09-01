"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import {
  initiatePaymentAction,
  cancelBookingAction,
} from "@/features/bookings/actions"

export interface BookingActionsProps {
  bookingId: string
  status: string
  /** When `payment=failed` is on the URL, surface the retry banner. */
  paymentFailed?: boolean
}

/**
 * Client-side orchestrator for the booking detail page. Drives payment
 * initiation (redirect to bKash or the dev mock URL) and cancellation.
 */
export function BookingActions({
  bookingId,
  status,
  paymentFailed,
}: BookingActionsProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  function pay() {
    start(async () => {
      const res = await initiatePaymentAction(bookingId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      if (res.paymentUrl) {
        // Mock URL is relative; bKash returns an absolute URL. Both work here.
        router.push(res.paymentUrl)
      }
    })
  }

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

  const canPay = status === "held"
  const canCancel = ["held", "payment_pending", "confirmed"].includes(status)

  return (
    <div className="space-y-3">
      {paymentFailed ? (
        <div className="rounded-lg border border-dt-red/40 bg-dt-red/10 p-3 text-sm text-dt-red">
          {t("booking.payFailedBanner")}
        </div>
      ) : null}

      {canPay ? (
        <Button onClick={pay} loading={pending} size="lg" className="w-full">
          {pending ? t("booking.preparingPayment") : t("booking.payWithBkash")}
        </Button>
      ) : null}

      {canCancel ? (
        confirmingCancel ? (
          <div className="space-y-2 rounded-lg border border-dt-line bg-dt-card p-3 text-sm">
            <p className="font-medium">{t("booking.cancelTitle")}</p>
            <p className="text-dt-dim">
              {t("booking.cancelPolicyNote")}
            </p>
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
      ) : null}
    </div>
  )
}
