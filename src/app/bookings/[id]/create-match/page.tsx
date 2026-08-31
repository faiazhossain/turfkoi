import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getT } from "@/i18n/server"
import { EmptyState } from "@/components/shared"
import { CreateMatchWizard } from "@/components/bookings/create-match-wizard"
import { MatchmakingHelp } from "@/components/matches/matchmaking-help"
import { getBooking } from "@/features/bookings/queries"
import { listMyTeams } from "@/features/teams/queries"
import { listAvailablePlayersNearTurf } from "@/features/player/queries"
import { db } from "@/db"
import { matches } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getCurrentUser } from "@/lib/auth"

/**
 * Match creation wizard for a confirmed booking — count-first: format →
 * squad size → "how many players do you already have?" (no identities) →
 * optional nearby available players → create. Identities (invites, guests)
 * are added progressively from the match room. Only the booker may create a
 * match on a booking, and only while the booking has no match yet (1:1).
 */
export default async function CreateMatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, user] = await Promise.all([getT(), getCurrentUser()])
  const booking = await getBooking(id)
  if (!booking) notFound()

  const { booking: b, turf } = booking
  const isBooker = user?.id === b.bookerId
  if (!user || !isBooker) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("booking.notFoundTitle")}
          description={t("booking.notFoundDesc")}
        />
      </div>
    )
  }
  if (b.status !== "confirmed") redirect(`/bookings/${id}`)

  const [existingMatch, myTeams, nearbyPlayers] = await Promise.all([
    db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.bookingId, b.id))
      .limit(1),
    listMyTeams(user.id),
    listAvailablePlayersNearTurf(turf.id),
  ])
  if (existingMatch.length > 0) redirect(`/bookings/${id}`)

  const captained = myTeams.filter((tm) => tm.role === "owner" || tm.role === "captain")
  const teams = captained.map((tm) => ({ id: tm.id, name: tm.name }))

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/bookings/${id}`} className="hover:text-foreground">
          {t("booking.breadcrumb")}
        </Link>{" "}
        / <span className="text-foreground">{t("matches.createCta")}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {t("matches.createTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {turf.name} · {b.date} · {b.slotStart.slice(0, 5)}
          </p>
        </div>
        <MatchmakingHelp />
      </header>

      <CreateMatchWizard
        bookingId={b.id}
        teams={teams}
        currentUserId={user.id}
        nearbyPlayers={nearbyPlayers.map((p) => ({
          userId: p.userId,
          name: p.name,
          position: p.position,
          area: p.area,
          distanceKm: p.distanceKm,
        }))}
      />
    </div>
  )
}
