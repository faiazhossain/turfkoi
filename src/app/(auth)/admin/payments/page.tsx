import Link from "next/link"
import { redirect } from "next/navigation"
import { BadgeCheckIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { PaymentSubmissionReview } from "@/components/admin/payment-submission-review"
import { PayoutsPanel } from "@/components/bookings/payouts-panel"
import { getCurrentUser } from "@/lib/auth"
import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"

import { listPaymentSubmissions } from "@/features/payments/queries"
import { listAllPayouts } from "@/features/bookings/queries"
import { imageUrl } from "@/features/images/service"
import { cn } from "@/lib/utils"

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const FILTERS = ["pending", "rejected", "consumed"] as const

const PURPOSE_KEY: Record<"wallet_topup" | "turf_booking", string> = {
  wallet_topup: "admin.payments.purposeWalletTopup",
  turf_booking: "admin.payments.purposeTurfBooking",
}

/**
 * Admin Payment Verification Center (manual bKash Send Money model). Every
 * Taka that enters the platform shows up here as evidence — TxID + receipt —
 * and NOTHING unlocks until an admin verifies it. Owner payouts (manual
 * bKash send-money out) live on the same page.
 */
export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("admin")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("admin.notAdminTitle")}
          description={t("admin.notAdminDesc")}
        />
      </div>
    )
  }

  const { status: statusParam } = await searchParams
  const status =
    statusParam && (FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof FILTERS)[number])
      : "pending"

  const [submissions, payouts] = await Promise.all([
    listPaymentSubmissions(status),
    listAllPayouts(30),
  ])

  // This week's payout window (Mon–Sun, UTC date strings) — same as overview.
  const now = new Date()
  const day = now.getUTCDay()
  const mondayOffset = day === 0 ? 6 : day - 1
  const periodEnd = now.toISOString().slice(0, 10)
  const periodStart = new Date(now.getTime() - mondayOffset * 86400000)
    .toISOString()
    .slice(0, 10)

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="font-heading text-lg font-semibold">
          {t("admin.payments.title")}
          {status === "pending" && submissions.length > 0
            ? ` (${submissions.length})`
            : ""}
        </h2>
        <p className="text-sm text-dt-dim">{t("admin.payments.subtitle")}</p>
        <p className="rounded-lg border border-dt-line bg-dt-card2/50 p-2 text-xs text-dt-dim">
          {t("admin.payments.mismatchHint")}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {(["pending", ...FILTERS.filter((f) => f !== "pending")] as const).map(
          (f) => (
            <Link
              key={f}
              href={`/admin/payments?status=${f}`}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm",
                status === f
                  ? "border-dt-line bg-dt-card2"
                  : "border-transparent text-dt-dim hover:text-dt-txt"
              )}
            >
              {t(`admin.payments.status.${f}`)}
            </Link>
          )
        )}
      </nav>

      {submissions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.payments.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {submissions.map((s) => {
            const bookingDead =
              s.purpose === "turf_booking" &&
              s.bookingStatus !== null &&
              !["held", "payment_pending"].includes(s.bookingStatus)
            return (
              <li
                key={s.id}
                className="rounded-xl border border-dt-line bg-dt-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-heading font-semibold">
                      {formatBdt(Number(s.amount))}{" "}
                      <span className="text-xs font-normal text-dt-dim">
                        · {t(PURPOSE_KEY[s.purpose])}
                      </span>
                    </p>
                    <p>
                      {s.payerName ?? "—"}{" "}
                      <span className="font-mono text-xs text-dt-dim">
                        {s.payerPhone}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-dt-dim">
                      {t("admin.payments.txId")}: {s.transactionId} ·{" "}
                      {t("admin.payments.senderNumber")}: {s.senderNumber}
                    </p>
                    {s.purpose === "turf_booking" && s.bookingId ? (
                      <p className="text-xs text-dt-dim">
                        {t("admin.payments.bookingRef")}:{" "}
                        <Link
                          href={`/bookings/${s.bookingId}`}
                          className="text-dt-green hover:underline"
                        >
                          {s.turfName ?? "—"} · {s.bookingDate}{" "}
                          {s.bookingSlotStart?.slice(0, 5) ?? ""}
                        </Link>
                      </p>
                    ) : null}
                    {s.userNote ? (
                      <p className="text-xs text-dt-dim">“{s.userNote}”</p>
                    ) : null}
                    {s.status === "rejected" && s.rejectReason ? (
                      <StatusBadge status="neutral">
                        {s.rejectReason}
                      </StatusBadge>
                    ) : null}
                    {s.status === "consumed" ? (
                      <StatusBadge status="success">
                        {t("admin.payments.status.consumed")}
                      </StatusBadge>
                    ) : null}
                    {bookingDead && s.status === "pending" ? (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                        {t("admin.payments.holdExpiredWarning")}
                      </div>
                    ) : null}
                  </div>
                  {s.status === "pending" ? (
                    <PaymentSubmissionReview submissionId={s.id} />
                  ) : null}
                </div>
                {s.receiptPublicId ? (
                  <div className="mt-3">
                    <p className="mb-1 flex items-center gap-1 text-xs text-dt-dim">
                      <BadgeCheckIcon className="size-3.5" aria-hidden />
                      {t("admin.payments.receipt")}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl(s.receiptPublicId, "card")}
                      alt={t("admin.payments.receipt")}
                      className="max-h-64 rounded-lg border border-dt-line"
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <PayoutsPanel
        payouts={payouts}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
    </div>
  )
}

export const dynamic = "force-dynamic"
