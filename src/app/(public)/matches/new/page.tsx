import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarPlusIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { EmptyState } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { listCreateMatchBookings } from "@/features/bookings/queries"
import {
  CreateMatchWizard,
  type WizardBooking,
} from "@/components/matches/create-match-wizard"
import { MatchmakingHelp } from "@/components/matches/matchmaking-help"

/**
 * Booking-first match creation — every signed-in user lands here from /app or
 * the matches hub. Step 1 picks the confirmed booking the match will be
 * played on (bookings are 1:1 with matches); with no eligible booking the
 * page sends the user to book a turf first.
 */
export async function generateMetadata() {
  return buildMetadata({
    titleKey: "metadata.matchesNewTitle",
    descriptionKey: "metadata.matchesNewDescription",
  })
}

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>
}) {
  const [{ booking }, t, user] = await Promise.all([
    searchParams,
    getT(),
    getCurrentUser(),
  ])
  if (!user) redirect("/login")

  const { eligible, pendingPayment } = await listCreateMatchBookings(user.id)

  if (eligible.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">
              {t("matches.createTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("matches.newSubtitle")}</p>
          </div>
          <MatchmakingHelp />
        </header>

        <EmptyState
          icon={CalendarPlusIcon}
          title={t("matches.noEligibleBookingsTitle")}
          description={t("matches.noEligibleBookingsDesc")}
          action={
            <Button render={<Link href="/turfs" />}>{t("matches.bookTurfCta")}</Button>
          }
        />

        {pendingPayment.length > 0 ? (
          <section className="space-y-2">
            <h2 className="font-heading text-sm font-semibold text-muted-foreground">
              {t("matches.pendingPaymentTitle")}
            </h2>
            <ul className="space-y-2">
              {pendingPayment.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{b.turfName}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {b.date} · {b.slotStart.slice(0, 5)}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    render={<Link href={`/bookings/${b.id}`} />}
                  >
                    {t("matches.completePaymentCta")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    )
  }

  const wizardBookings: WizardBooking[] = eligible.map((b) => ({
    id: b.id,
    turfName: b.turfName,
    turfArea: b.turfArea,
    date: b.date,
    slotStart: b.slotStart,
    slotEnd: b.slotEnd,
  }))
  const wizardPending: WizardBooking[] = pendingPayment.map((b) => ({
    id: b.id,
    turfName: b.turfName,
    turfArea: b.turfArea,
    date: b.date,
    slotStart: b.slotStart,
    slotEnd: b.slotEnd,
  }))

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {t("matches.createTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("matches.newSubtitle")}</p>
        </div>
        <MatchmakingHelp />
      </header>

      <CreateMatchWizard
        bookings={wizardBookings}
        pendingPayment={wizardPending}
        preselectedBookingId={booking ?? null}
      />
    </div>
  )
}
