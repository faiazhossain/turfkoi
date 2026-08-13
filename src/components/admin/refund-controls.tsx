"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  requestRefundAction,
  approveRefundAction,
  rejectRefundAction,
} from "@/features/admin/actions"

/** H4 threshold — kept in sync with the server constant. */
const DUAL_CONTROL_THRESHOLD = 5000

/**
 * Inline "Request refund" control for a single booking row. Reveals an amount +
 * reason form. Amounts over ৳5,000 are staged for a second admin; below the
 * threshold the refund executes immediately.
 */
export function RefundRequestButton({
  bookingId,
  maxAmount,
}: {
  bookingId: string
  maxAmount: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(maxAmount))
  const [reason, setReason] = useState("")

  const needsApproval = Number(amount) > DUAL_CONTROL_THRESHOLD

  function submit() {
    start(async () => {
      const res = await requestRefundAction({
        bookingId,
        amount: Number(amount),
        reason: reason.trim() || undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.needsApproval
          ? "Refund staged — a second admin must approve (over ৳5,000)."
          : "Refund executed."
      )
      setOpen(false)
      setReason("")
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Refund
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Refund amount (৳)
      </label>
      <Input
        type="number"
        min={0}
        max={maxAmount}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-32"
      />
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (visible to other admins)"
        rows={2}
        className="bg-background"
      />
      {needsApproval ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangleIcon className="size-3.5" aria-hidden />
          Over ৳5,000 — requires a second admin to approve.
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={submit} disabled={pending || Number(amount) <= 0}>
          {needsApproval ? "Stage refund" : "Execute refund"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setReason("")
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Dual-control review actions for a pending refund request row. */
export function RefundReviewActions({
  refundRequestId,
  canApprove,
}: {
  refundRequestId: string
  /** false when the current user is the requester (can't self-approve). */
  canApprove: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function approve() {
    start(async () => {
      const res = await approveRefundAction({ refundRequestId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Refund approved + executed.")
      router.refresh()
    })
  }

  function reject() {
    start(async () => {
      const res = await rejectRefundAction({ refundRequestId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Refund request rejected.")
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        onClick={approve}
        disabled={pending || !canApprove}
        title={
          canApprove
            ? "Approve and execute"
            : "Dual-control: you requested this refund, so you can't approve it"
        }
      >
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={reject} disabled={pending}>
        Reject
      </Button>
    </div>
  )
}
