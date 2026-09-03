import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2Icon, ClockIcon, MapPinIcon } from "lucide-react"
import { and, eq } from "drizzle-orm"

import { StatusBadge, EmptyState } from "@/components/shared"
import { FeeBreakdown } from "@/components/bookings/fee-breakdown"
import { BookingActions } from "@/components/bookings/booking-actions"
import { CreateMatchButton } from "@/components/bookings/create-match-button"
import { PaymentSubmissionForm } from "@/components/payments/payment-submission-form"
import { DevVerifyButton } from "@/components/payments/dev-verify-button"
import { getBooking } from "@/features/bookings/queries"
import { getBookingPaymentSubmission } from "@/features/payments/queries"
import { db } from "@/db"
import { matches, turfSlots } from "@/db/schema"
import { computeFees } from "@/lib/pricing"
import { PLATFORM_BKASH_NUMBER } from "@/lib/platform-payments"
import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import type { Metadata } from "next"
import { buildMetadata } from "@/i18n/metadata"
import { bookingStatusLabel } from "@/i18n/labels"

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "primary"> = {
  held: "warning",
  payment_pending: "warning",
  confirmed: "success",
  completed: "success",
  cancelled: "neutral",
  expired: "neutral",
  refunded: "neutral",
  payment_failed: "warning",
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.bookingTitle" })
}

export default async function BookingDetailPage({ params }: PageProps) {
  const t = await getT()
  const { id } = await params

  const user = await getCurrentUser()
  const booking = await getBooking(id)
  if (!booking) notFound()

  // Only the booker (and admins) may view a booking.
  if (!user || (user.id !== booking.booking.bookerId && !user.roles.includes("admin"))) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("booking.notFoundTitle")}
          description={t("booking.notFoundDesc")}
        />
      </div>
    )
  }

  const { booking: b, turf, transaction } = booking

  // Manual bKash intake: the authoritative expected amount comes from the
  // slot price (server recompute), and the latest submission drives the banner.
  const awaitingPayment = b.status === "held" || b.status === "payment_pending"
  const submission = awaitingPayment ? await getBookingPaymentSubmission(b.id) : null
  const [slot] = awaitingPayment
    ? await db
        .select({ price: turfSlots.price })
        .from(turfSlots)
        .where(
          and(
            eq(turfSlots.turfId, b.turfId),
            eq(turfSlots.date, b.date),
            eq(turfSlots.startTime, b.slotStart)
          )
        )
        .limit(1)
    : []

  // Fee breakdown — never approximate: the platform fee is 5% of the BASE
  // price capped at ৳100, so a `total / 1.05` split is wrong the moment the
  // cap applies (e.g. ৳3,000 turf shows 2,952 + 148 instead of 3,000 + 100).
  // 1. A confirmed payment: the transaction row is exact (immutable fee).
  // 2. Pre-payment: recompute from the slot price — identical to what the
  //    payment submission and the verify CTE charge.
  let turfAmount: number
  let platformFee: number
  let total: number
  if (transaction) {
    turfAmount = Number(transaction.amount) - Number(transaction.platformFee)
    platformFee = Number(transaction.platformFee)
    total = Number(transaction.amount)
  } else if (slot) {
    const fees = computeFees(Number(slot.price))
    turfAmount = fees.turfAmount
    platformFee = fees.platformFee
    total = fees.total
  } else {
    // Degenerate fallback (slot row gone): show the stored total as-is.
    turfAmount = Number(b.totalAmount ?? 0)
    platformFee = 0
    total = Number(b.totalAmount ?? 0)
  }

  const fmt = (time: string) => time.slice(0, 5)
  const tone = STATUS_TONE[b.status] ?? "neutral"
  const expectedTotal = Math.round(total)

  // Labels resolve from the typed key maps (unknown enum values fail typecheck).
  const statusText = t(bookingStatusLabel(b.status))
  const policyKey = `booking.policy.${turf.cancellationPolicy}`
  const policyLabel = t(policyKey)
  const policyText =
    policyLabel === policyKey ? turf.cancellationPolicy.replace(/_/g, " ") : policyLabel

  // For confirmed bookings: check if a match already exists (1:1).
  let existingMatch: { id: string } | null = null
  if (b.status === "confirmed") {
    const [m] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.bookingId, b.id))
      .limit(1)
    existingMatch = m ?? null
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-dt-dim">
        <Link href="/app" className="hover:text-dt-txt">
          {t("player.bookingsTitle")}
        </Link>{" "}
        / <span className="text-dt-txt">{t("booking.breadcrumb")}</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{turf.name}</h1>
          <StatusBadge status={tone} showIcon={false}>
            {statusText}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-1 text-sm text-dt-dim">
          <MapPinIcon className="size-4" aria-hidden />
          {[turf.area, turf.city].filter(Boolean).join(", ") || t("turfs.locationTbd")}
        </div>
        <div className="flex items-center gap-1 text-sm text-dt-dim">
          <ClockIcon className="size-4" aria-hidden />
          <span className="font-mono">
            {b.date} · {fmt(b.slotStart)}–{fmt(b.slotEnd)}
          </span>
        </div>
      </header>

      {b.status === "confirmed" || b.status === "completed" ? (
        <div className="flex items-center gap-2 rounded-lg border border-dt-line bg-dt-card p-3 text-sm">
          <CheckCircle2Icon className="size-4 text-dt-green" aria-hidden />
          {b.status === "completed"
            ? t("booking.playedSettled")
            : t("booking.confirmedNote")}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-heading text-sm font-semibold">{t("booking.payment")}</h2>
        <FeeBreakdown
          turfAmount={Math.round(turfAmount)}
          platformFee={Math.round(platformFee)}
          total={Math.round(total)}
        />
      </section>

      {awaitingPayment && user.id === b.bookerId ? (
        submission?.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <span>{t("payments.pendingBanner")}</span>
            <DevVerifyButton submissionId={submission.id} />
          </div>
        ) : (
          <>
            {submission?.status === "rejected" ? (
              <div className="rounded-lg border border-dt-red/40 bg-dt-red/10 p-3 text-sm text-dt-red">
                {t("payments.rejectedBanner", {
                  reason: submission.rejectReason ?? "",
                })}
              </div>
            ) : null}
            <PaymentSubmissionForm
              userId={user.id}
              purpose="turf_booking"
              amount={expectedTotal}
              platformNumber={PLATFORM_BKASH_NUMBER}
              bookingId={b.id}
            />
          </>
        )
      ) : null}

      <BookingActions bookingId={b.id} status={b.status} />

      {b.status === "confirmed" && existingMatch ? (
        <div className="rounded-lg border border-dt-line bg-dt-card p-3 text-sm">
          <a
            href={`/matches/${existingMatch.id}`}
            className="text-dt-green hover:underline"
          >
            {t("booking.viewMatch")}
          </a>
        </div>
      ) : null}

      {b.status === "confirmed" && !existingMatch ? (
        <CreateMatchButton bookingId={b.id} />
      ) : null}

      <section className="space-y-1 text-xs text-dt-dim">
        <p>
          {t("booking.cancellationPolicy")}{" "}
          <span className="capitalize text-dt-txt">
            {policyText}
          </span>
        </p>
        {transaction ? (
          <p>{t("booking.providerRef", { ref: transaction.providerReference ?? "—" })}</p>
        ) : null}
      </section>
    </div>
  )
}

// Booking detail is dynamic — it reflects payment state live.
export const dynamic = "force-dynamic"
