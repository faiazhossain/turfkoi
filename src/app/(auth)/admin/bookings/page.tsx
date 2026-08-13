import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/shared"
import {
  RefundRequestButton,
  RefundReviewActions,
} from "@/components/admin"
import { getCurrentUser } from "@/lib/auth"
import {
  listBookingsAdmin,
  listRefundRequests,
} from "@/features/admin/queries"

const TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  held: "warning",
  payment_pending: "warning",
  payment_failed: "danger",
  confirmed: "success",
  completed: "success",
  cancelled: "neutral",
  expired: "neutral",
  refunded: "neutral",
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const [bookings, pendingRefunds, user] = await Promise.all([
    listBookingsAdmin({ status, limit: 50 }),
    listRefundRequests({ status: "pending", limit: 20 }),
    getCurrentUser(),
  ])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Pending refunds</h2>
        <p className="text-sm text-muted-foreground">
          Refunds over ৳5,000 require a second admin to approve. The requester
          can&apos;t approve their own request.
        </p>
        {pendingRefunds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No pending refund requests.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingRefunds.map((r) => {
              const amount = Number(r.amount)
              const canApprove = !!user && r.requestedById !== user.id
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="font-heading font-medium">
                      ৳{amount.toLocaleString()}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        refund
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.turfName} · requested by {r.requestedByPhone}
                    </p>
                    {r.reason ? (
                      <p className="text-xs italic text-muted-foreground">
                        &quot;{r.reason}&quot;
                      </p>
                    ) : null}
                  </div>
                  <RefundReviewActions
                    refundRequestId={r.id}
                    canApprove={canApprove}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Bookings</h2>
          <form className="flex items-center gap-2 text-sm">
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-border bg-background px-2 py-1.5"
            >
              <option value="">All statuses</option>
              {[
                "held",
                "payment_pending",
                "confirmed",
                "completed",
                "cancelled",
                "refunded",
              ].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted"
            >
              Filter
            </button>
          </form>
        </div>
        {bookings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No bookings match.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turf</TableHead>
                <TableHead>Booker</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const refundable = ["confirmed", "completed"].includes(b.status)
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        href={`/bookings/${b.id}`}
                        className="font-medium hover:underline"
                      >
                        {b.turfName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.bookerPhone}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.date} {b.slotStart.slice(0, 5)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={TONE[b.status] ?? "neutral"} showIcon={false}>
                        {b.status.replace(/_/g, " ")}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {b.totalAmount
                        ? `৳${Number(b.totalAmount).toLocaleString()}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {refundable && b.totalAmount ? (
                        <RefundRequestButton
                          bookingId={b.id}
                          maxAmount={Number(b.totalAmount)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
