import type { Metadata } from "next"
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
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { bookingStatusLabel } from "@/i18n/labels"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminBookingsTitle" })
}

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
  const t = await getT()
  const { status } = await searchParams
  const [bookings, pendingRefunds, user] = await Promise.all([
    listBookingsAdmin({ status, limit: 50 }),
    listRefundRequests({ status: "pending", limit: 20 }),
    getCurrentUser(),
  ])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t("admin.bookings.pendingRefundsTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("admin.bookings.refundsNote")}
        </p>
        {pendingRefunds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("admin.bookings.noPendingRefunds")}
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
                        {t("admin.bookings.refund")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.turfName} · {t("admin.bookings.requestedBy", { phone: r.requestedByPhone })}
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
          <h2 className="font-heading text-lg font-semibold">{t("admin.bookings.title")}</h2>
          <form className="flex items-center gap-2 text-sm">
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-border bg-background px-2 py-1.5"
            >
              <option value="">{t("admin.allStatuses")}</option>
              {[
                "held",
                "payment_pending",
                "confirmed",
                "completed",
                "cancelled",
                "refunded",
              ].map((s) => (
                <option key={s} value={s}>
                  {t(bookingStatusLabel(s))}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted"
            >
              {t("admin.filter")}
            </button>
          </form>
        </div>
        {bookings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("admin.bookings.empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.bookings.colTurf")}</TableHead>
                <TableHead>{t("admin.bookings.colBooker")}</TableHead>
                <TableHead>{t("admin.bookings.colSlot")}</TableHead>
                <TableHead>{t("admin.bookings.colStatus")}</TableHead>
                <TableHead>{t("admin.bookings.colTotal")}</TableHead>
                <TableHead>{t("admin.bookings.colRefund")}</TableHead>
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
                        {t(bookingStatusLabel(b.status))}
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
