import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2Icon, ClockIcon, MapPinIcon } from "lucide-react"

import { StatusBadge, EmptyState } from "@/components/shared"
import { FeeBreakdown } from "@/components/bookings/fee-breakdown"
import { BookingActions } from "@/components/bookings/booking-actions"
import { CreateMatchButton } from "@/components/bookings/create-match-button"
import { getBooking } from "@/features/bookings/queries"
import { listMyTeams } from "@/features/teams/queries"
import { db } from "@/db"
import { matches } from "@/db/schema"
import { eq } from "drizzle-orm"
import { computeFees } from "@/lib/pricing"
import { getCurrentUser } from "@/lib/auth"

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ payment?: string }>
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

export default async function BookingDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { payment } = await searchParams

  const user = await getCurrentUser()
  const booking = await getBooking(id)
  if (!booking) notFound()

  // Only the booker (and admins) may view a booking.
  if (!user || (user.id !== booking.booking.bookerId && !user.roles.includes("admin"))) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Booking not found"
          description="You don't have access to this booking."
        />
      </div>
    )
  }

  const { booking: b, turf, transaction } = booking

  // Recover the breakdown from the transaction if present (immutable platformFee),
  // otherwise compute from the slot price on the fly (held state, pre-payment).
  const turfAmount = transaction
    ? Number(transaction.amount) - Number(transaction.platformFee)
    : Number(b.totalAmount ?? 0) / 1.05 // pre-payment approximation
  const platformFee = transaction
    ? Number(transaction.platformFee)
    : Number(b.totalAmount ?? 0) - turfAmount
  const total = Number(b.totalAmount ?? computeFees(turfAmount).total)

  const fmt = (t: string) => t.slice(0, 5)
  const tone = STATUS_TONE[b.status] ?? "neutral"
  const paymentFailed = payment === "failed"

  // For confirmed bookings: check if a match already exists + load teams.
  let existingMatch: { id: string } | null = null
  let userTeams: { id: string; name: string; role: string }[] = []
  if (b.status === "confirmed" && user) {
    const [m] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.bookingId, b.id))
      .limit(1)
    existingMatch = m ?? null
    if (!existingMatch) {
      const teams = await listMyTeams(user.id)
      userTeams = teams
        .filter((t) => t.role === "owner" || t.role === "captain")
        .map((t) => ({ id: t.id, name: t.name, role: t.role }))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/app" className="hover:text-foreground">
          Your bookings
        </Link>{" "}
        / <span className="text-foreground">Booking</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{turf.name}</h1>
          <StatusBadge status={tone} showIcon={false}>
            {b.status.replace(/_/g, " ")}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPinIcon className="size-4" aria-hidden />
          {[turf.area, turf.city].filter(Boolean).join(", ") || "Location TBD"}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          <span className="font-mono">
            {b.date} · {fmt(b.slotStart)}–{fmt(b.slotEnd)}
          </span>
        </div>
      </header>

      {b.status === "confirmed" || b.status === "completed" ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <CheckCircle2Icon className="size-4 text-primary" aria-hidden />
          {b.status === "completed"
            ? "Match played — settlement complete."
            : "Booking confirmed. See you at kickoff!"}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-heading text-sm font-semibold">Payment</h2>
        <FeeBreakdown
          turfAmount={Math.round(turfAmount)}
          platformFee={Math.round(platformFee)}
          total={Math.round(total)}
        />
      </section>

      <BookingActions
        bookingId={b.id}
        status={b.status}
        paymentFailed={paymentFailed}
      />

      {b.status === "confirmed" && existingMatch ? (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <a
            href={`/matches/${existingMatch.id}`}
            className="text-primary hover:underline"
          >
            View match →
          </a>
        </div>
      ) : null}

      {b.status === "confirmed" && !existingMatch ? (
        <CreateMatchButton bookingId={b.id} teams={userTeams} />
      ) : null}

      <section className="space-y-1 text-xs text-muted-foreground">
        <p>
          Cancellation policy:{" "}
          <span className="capitalize text-foreground">
            {turf.cancellationPolicy.replace(/_/g, " ")}
          </span>
        </p>
        {transaction ? (
          <p>Provider reference: {transaction.providerReference ?? "—"}</p>
        ) : null}
      </section>
    </div>
  )
}

// Booking detail is dynamic — it reflects payment state live.
export const dynamic = "force-dynamic"
