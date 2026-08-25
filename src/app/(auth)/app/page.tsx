import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDaysIcon, ZapIcon, MapPinIcon, GiftIcon, ShieldIcon, StoreIcon } from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { buildMetadata } from "@/i18n/metadata"
import { getT } from "@/i18n/server"
import { Button } from "@/components/ui/button"
import { AvailabilityToggle } from "@/components/player/availability-toggle"
import { JoinRequestButton } from "@/components/player/join-request-button"
import { ConfirmPlayedButton } from "@/components/player/confirm-played-button"
import { getCurrentUser, getSession } from "@/lib/auth"
import { listMyBookings } from "@/features/bookings/queries"
import {
  listMatchesNeedingPlayers,
  listPlayerMatchHistory,
  getPlayerProfile,
} from "@/features/player/queries"
import { getOrCreateReferralCode } from "@/features/auth/referrals"

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  held: "warning",
  payment_pending: "warning",
  confirmed: "success",
  completed: "success",
  cancelled: "neutral",
  expired: "neutral",
  refunded: "neutral",
}

const MATCH_STATE_TONE: Record<string, "success" | "warning" | "neutral" | "primary"> = {
  confirmed: "primary",
  roster_building: "warning",
  ready: "success",
  ongoing: "primary",
  completed: "success",
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.playerDashboardTitle" })
}

export default async function PlayerDashboardPage() {
  const t = await getT()
  const session = await getSession()
  if (!session?.user) redirect("/login")
  const user = await getCurrentUser()

  // A pure admin is not a player — their dashboard is the admin console.
  // Admins who also own turfs or teams keep access to the player view.
  const roles = user?.roles ?? []
  if (
    roles.includes("admin") &&
    !roles.includes("turf_owner") &&
    !roles.includes("team_owner")
  ) {
    redirect("/admin")
  }

  const extraRoles = roles.filter((r) => r !== "player")

  const profile = await getPlayerProfile(session.user.id)
  const [bookings, nearbyMatches, history, refCode] = await Promise.all([
    listMyBookings(session.user.id, 5),
    listMatchesNeedingPlayers(profile?.coords ?? null, 5),
    listPlayerMatchHistory(session.user.id, 5),
    getOrCreateReferralCode(session.user.id),
  ])
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${refCode}`

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {session.user.name ?? t("player.dashboardTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{session.user.phone}</p>
        </div>
      </div>

      {/* Role switcher — only for users with more than the player hat */}
      {extraRoles.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("player.switchHats")}
          </span>
          {user!.roles.includes("turf_owner") && (
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/turf-owner" />}
            >
              <StoreIcon aria-hidden />
              {t("player.turfOwner")}
            </Button>
          )}
          {user!.roles.includes("admin") && (
            <Button size="sm" variant="outline" render={<Link href="/admin" />}>
              <ShieldIcon aria-hidden />
              {t("player.admin")}
            </Button>
          )}
        </section>
      )}

      {/* Availability toggle */}
      <section>
        <AvailabilityToggle available={profile?.available ?? false} />
      </section>

      {/* Invite friends (A3 referral — minimal MVP scaffold) */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <GiftIcon className="size-5 text-primary" aria-hidden />
          <h2 className="font-heading text-lg font-semibold">
            {t("player.inviteTitle")}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("player.inviteDesc")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border bg-muted px-2 py-1 text-sm">
            {inviteUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            render={
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  t("player.inviteShareText", { url: inviteUrl })
                )}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            {t("player.shareOnWhatsApp")}
          </Button>
          <Link
            href="/app/settings"
            className="text-xs text-muted-foreground hover:underline"
          >
            {t("player.accountSettings")}
          </Link>
        </div>
      </section>

      {/* Bookings */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {t("player.bookingsTitle")}
        </h2>
        {bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            title={t("player.noBookingsTitle")}
            description={t("player.noBookingsDesc")}
            action={
              <Link
                href="/turfs"
                className="text-sm font-medium text-primary hover:underline"
              >
                {t("player.findTurf")}
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {bookings.map((b) => {
              const tone = STATUS_TONE[b.status] ?? "neutral"
              return (
                <li key={b.id}>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="flex items-center justify-between gap-2 bg-card p-3 text-sm hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading font-medium">
                        {b.turfName}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {b.date} · {b.slotStart.slice(0, 5)}–{b.slotEnd.slice(0, 5)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.totalAmount ? (
                        <span className="tabular-nums text-muted-foreground">
                          ৳{Number(b.totalAmount).toLocaleString()}
                        </span>
                      ) : null}
                      <StatusBadge status={tone} showIcon={false}>
                        {t(`player.bookingStatus.${b.status}`)}
                      </StatusBadge>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Nearby matches needing players */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ZapIcon className="size-5 text-primary" aria-hidden />
          <h2 className="font-heading text-lg font-semibold">
            {t("player.playTonightTitle")}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("player.playTonightDesc")}
        </p>
        {nearbyMatches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("player.noNearbyMatches")}
          </p>
        ) : (
          <ul className="space-y-2">
            {nearbyMatches.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/matches/${m.id}`}
                      className="truncate font-heading font-medium hover:underline"
                    >
                      {m.teams.map((tm) => tm.teamName).join(` ${t("player.vs")} `) ||
                        t("matches.breadcrumbMatch")}
                    </Link>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3" aria-hidden />
                      {m.turfName}
                      {m.distanceKm != null ? ` · ${m.distanceKm.toFixed(1)} km` : ""}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {m.date} · {m.slotStart.slice(0, 5)}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <JoinRequestButton matchId={m.id} spots={m.openSpots} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Match history */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {t("player.historyTitle")}
        </h2>
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("player.noHistory")}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/matches/${h.id}`}
                    className="truncate font-heading font-medium hover:underline"
                  >
                    {h.turfName}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">
                    {h.date} · {h.slotStart.slice(0, 5)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {h.state === "completed" && h.homeScore != null ? (
                    <span className="tabular-nums text-xs">
                      {h.homeScore}–{h.awayScore}
                    </span>
                  ) : null}
                  <StatusBadge
                    status={MATCH_STATE_TONE[h.state] ?? "neutral"}
                    showIcon={false}
                  >
                    {t(`matches.state.${h.state}`)}
                  </StatusBadge>
                  {h.state === "completed" && !h.playedConfirmedAt ? (
                    <ConfirmPlayedButton matchId={h.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
