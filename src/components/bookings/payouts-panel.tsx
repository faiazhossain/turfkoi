"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared"
import {
  generateWeeklyPayoutsAction,
  markPayoutPaidAction,
} from "@/features/bookings/actions"

interface Payout {
  id: string
  turfOwnerId: string
  amount: string
  periodStart: string
  periodEnd: string
  status: "pending" | "scheduled" | "paid" | "failed"
  providerReference: string | null
  createdAt: Date
  paidAt: Date | null
}

/**
 * Admin payouts surface. Phase 3 ships the minimum to run the money flow:
 * generate weekly payouts + mark paid after the manual bKash send-money.
 * The deeper dispute / dual-control UI lands in Phase 7 (H4).
 */
export function PayoutsPanel({
  payouts,
  periodStart,
  periodEnd,
}: {
  payouts: Payout[]
  periodStart: string
  periodEnd: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [payingId, setPayingId] = useState<string | null>(null)
  const [ref, setRef] = useState("")

  function generate() {
    start(async () => {
      const res = await generateWeeklyPayoutsAction(periodStart, periodEnd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Generated ${res.count} payout row(s).`)
      router.refresh()
    })
  }

  function markPaid(payoutId: string) {
    start(async () => {
      const res = await markPayoutPaidAction({ payoutId, providerReference: ref })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Marked paid.")
      setPayingId(null)
      setRef("")
      router.refresh()
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">Weekly payouts</h2>
          <p className="text-sm text-muted-foreground">
            Period: {periodStart} → {periodEnd}
          </p>
        </div>
        <Button onClick={generate} loading={pending}>
          Generate this week&apos;s payouts
        </Button>
      </div>

      {payouts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No payouts yet. Click generate to sweep settled bookings.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {payouts.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 text-sm"
            >
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  {p.periodStart} → {p.periodEnd}
                </p>
                <p className="font-semibold tabular-nums">
                  ৳{Number(p.amount).toLocaleString()}
                </p>
                {p.providerReference ? (
                  <p className="text-xs text-muted-foreground">
                    bKash: {p.providerReference}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={p.status === "paid" ? "success" : "warning"}
                  showIcon={false}
                >
                  {p.status}
                </StatusBadge>
                {p.status === "pending" ? (
                  payingId === p.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={ref}
                        onChange={(e) => setRef(e.target.value)}
                        placeholder="bKash trxId"
                        className="w-32"
                      />
                      <Button
                        size="sm"
                        onClick={() => markPaid(p.id)}
                        loading={pending}
                        disabled={ref.length < 4}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPayingId(null)
                          setRef("")
                        }}
                        disabled={pending}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPayingId(p.id)}
                    >
                      Mark paid
                    </Button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
