"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
  const [pending, start] = useTransition()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  function pay() {
    start(async () => {
      const res = await initiatePaymentAction(bookingId)
      if (!res.ok) {
        toast.error(res.error)
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
        toast.error(res.error)
        setConfirmingCancel(false)
        return
      }
      toast.success(
        typeof res.refundAmount === "number" && res.refundAmount > 0
          ? `Cancelled — refund of ৳${res.refundAmount.toLocaleString()} queued.`
          : "Booking cancelled."
      )
      router.refresh()
    })
  }

  const canPay = status === "held"
  const canCancel = ["held", "payment_pending", "confirmed"].includes(status)

  return (
    <div className="space-y-3">
      {paymentFailed ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Your payment didn&apos;t go through. You can retry below.
        </div>
      ) : null}

      {canPay ? (
        <Button onClick={pay} loading={pending} size="lg" className="w-full">
          {pending ? "Preparing payment…" : "Pay with bKash"}
        </Button>
      ) : null}

      {canCancel ? (
        confirmingCancel ? (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
            <p className="font-medium">Cancel this booking?</p>
            <p className="text-muted-foreground">
              The refund depends on the turf&apos;s cancellation policy.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={cancel}
                loading={pending}
                variant="destructive"
                size="sm"
              >
                Yes, cancel
              </Button>
              <Button
                onClick={() => setConfirmingCancel(false)}
                disabled={pending}
                variant="ghost"
                size="sm"
              >
                Keep booking
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
            Cancel booking
          </Button>
        )
      ) : null}
    </div>
  )
}
