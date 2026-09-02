import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CalendarDaysIcon,
  MapPinIcon,
  ShieldIcon,
  StoreIcon,
  PlusIcon,
} from "lucide-react"

import { EmptyState, StatusBadge } from "@/components/shared"
import { buildMetadata } from "@/i18n/metadata"
import { getT, getLocale } from "@/i18n/server"
import { formatSlotDate } from "@/lib/format-date"
import {
  formatSlotTime,
  formatSlotTimeRange,
  slotStartEpochMs,
} from "@/lib/format-time"
import { KickoffCountdown } from "@/components/player/kickoff-countdown"
import { Button } from "@/components/ui/button"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import { AvailabilityToggle } from "@/components/player/availability-toggle"
import { XpInfoButton } from "@/components/player/xp-info"
import { JoinRequestButton } from "@/components/player/join-request-button"
import { ConfirmPlayedButton } from "@/components/player/confirm-played-button"
import { FriendsCard } from "@/components/friends/friends-card"
import { getCurrentUser, getSession } from "@/lib/auth"
import { listMyBookings } from "@/features/bookings/queries"
import {
  listMatchesNeedingPlayers,
  listPlayerMatchHistory,
  countPlayerMatches,
  getPlayerProfile,
} from "@/features/player/queries"
import { listFriends, listPendingFriendRequests } from "@/features/friends/queries"
import { getOrCreateReferralCode } from "@/features/auth/referrals"
import { getWalletBalance } from "@/features/wallet/queries"
import { bookingStatusLabel, matchStateLabel, positionLabelKey, skillLabelKey } from "@/i18n/labels"

// XP curve: every 5 completed matches levels the player up.
const XP_PER_LEVEL = 5

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
  const [t, locale] = await Promise.all([getT(), getLocale()])
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
  const [bookings, nearbyMatches, history, refCode, friends, friendRequests, matchesPlayed, walletBalance] =
    await Promise.all([
      listMyBookings(session.user.id, 5),
      listMatchesNeedingPlayers(profile?.coords ?? null, 5),
      listPlayerMatchHistory(session.user.id, session.user.phone ?? null, 5),
      getOrCreateReferralCode(session.user.id),
      listFriends(session.user.id),
      listPendingFriendRequests(session.user.id),
      countPlayerMatches(session.user.id, session.user.phone ?? null),
      getWalletBalance(session.user.id),
    ])
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${refCode}`

  // Derived game progression (no schema behind it — just completed matches).
  const level = Math.floor(matchesPlayed / XP_PER_LEVEL) + 1
  const xpInto = matchesPlayed % XP_PER_LEVEL
  const xpPct = (xpInto / XP_PER_LEVEL) * 100

  const avatarDisplay = resolveAvatarDisplay({
    avatarType: profile?.avatarType ?? null,
    avatarPublicId: profile?.avatarPublicId ?? null,
    avatarPresetId: profile?.avatarPresetId ?? null,
    name: session.user.name,
  })

  return (
    <div className="player-hq mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="match-hq-glow" aria-hidden />

      {/* Hero — player card */}
      <section className="player-hero rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <PlayerAvatar
            display={avatarDisplay}
            size="xl"
            alt={t("settings.avatarAlt")}
          />
          <div className="min-w-0">
            <p className="match-eyebrow">{t("player.hqEyebrow")}</p>
            <h1 className="match-grad mt-1 truncate font-heading text-2xl font-bold">
              {session.user.name ?? t("player.dashboardTitle")}
            </h1>
            {profile?.playerId ? (
              <code className="mt-1 inline-block rounded-md border border-dt-line bg-dt-card2 px-2 py-0.5 font-mono text-xs text-dt-blue">
                {profile.playerId}
              </code>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <AvailabilityToggle available={profile?.available ?? false} />
        </div>

        {/* Class / rank chips (legacy free-text positions fall back to None) */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="player-chip rounded-full px-2.5 py-1">
            {t("player.classLabel")}:{" "}
            <span className="text-dt-txt">
              {t(
                (profile?.position && positionLabelKey(profile.position)) ??
                  "player.positionNone"
              )}
            </span>
          </span>
          {profile?.skill && skillLabelKey(profile.skill) ? (
            <span className="player-chip rounded-full px-2.5 py-1">
              {t("player.rankLabel")}:{" "}
              <span className="text-dt-txt">
                {t(skillLabelKey(profile.skill)!)}
              </span>
            </span>
          ) : null}
        </div>

        {/* Level / XP progression */}
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-small text-dt-dim">
              {t("player.levelLabel")}{" "}
              <span className="match-score text-base font-bold text-dt-green">
                {level}
              </span>
            </p>
            <p className="flex items-center gap-1 text-xs text-dt-dim">
              {t("player.xpNext", { xp: xpInto, total: XP_PER_LEVEL })}
              <XpInfoButton />
            </p>
          </div>
          <div
            className="player-xp mt-2 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={XP_PER_LEVEL}
            aria-valuenow={xpInto}
          >
            <div
              className="player-xp-fill h-full rounded-full"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-dt-line bg-dt-card2 p-3 text-center">
            <p className="match-score text-lg font-bold text-dt-txt">{level}</p>
            <p className="mt-0.5 text-xs text-dt-dim">{t("player.levelLabel")}</p>
          </div>
          <div className="rounded-xl border border-dt-line bg-dt-card2 p-3 text-center">
            <p className="match-score text-lg font-bold text-dt-txt">
              {matchesPlayed}
            </p>
            <p className="mt-0.5 text-xs text-dt-dim">{t("player.statMatches")}</p>
          </div>
          <div className="rounded-xl border border-dt-line bg-dt-card2 p-3 text-center">
            <p className="match-score text-lg font-bold text-dt-txt">
              {friends.length}
            </p>
            <p className="mt-0.5 text-xs text-dt-dim">{t("player.statSquad")}</p>
          </div>
          <Link
            href="/app/wallet"
            className="rounded-xl border border-dt-line bg-dt-card2 p-3 text-center transition-colors hover:bg-dt-card"
          >
            <p className="match-score text-lg font-bold text-dt-green">
              ৳{walletBalance.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-dt-dim">{t("nav.wallet")}</p>
          </Link>
        </div>
      </section>

      {/* Switch mode — only for users with more than the player hat */}
      {extraRoles.length > 0 && (
        <section className="space-y-3">
          <h2 className="match-eyebrow">{t("player.switchModeTitle")}</h2>
          <div className="flex flex-wrap items-center gap-3">
            {user!.roles.includes("turf_owner") && (
              <Button
                size="sm"
                variant="outline"
                className="match-btn-outline"
                render={<Link href="/turf-owner" />}
              >
                <StoreIcon aria-hidden />
                {t("player.turfOwner")}
              </Button>
            )}
            {user!.roles.includes("admin") && (
              <Button
                size="sm"
                variant="outline"
                className="match-btn-outline"
                render={<Link href="/admin" />}
              >
                <ShieldIcon aria-hidden />
                {t("player.admin")}
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Join a battle — nearby matches needing players */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="match-eyebrow">{t("player.battleTitle")}</h2>
          <Button
            size="sm"
            variant="outline"
            className="match-btn-lime ml-auto border-0"
            render={<Link href="/matches/new" />}
          >
            <PlusIcon aria-hidden />
            {t("matches.dashboardCreateCta")}
          </Button>
        </div>
        <p className="text-small text-dt-dim">{t("player.playTonightDesc")}</p>
        {nearbyMatches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-dt-line p-4 text-small text-dt-dim">
            {t("player.noNearbyMatches")}
          </p>
        ) : (
          <ul className="space-y-2">
            {nearbyMatches.map((m) => {
              const own =
                m.captainId === session.user.id ||
                m.awayCaptainId === session.user.id
              return (
                <li
                  key={m.id}
                  className="rounded-xl border border-dt-line bg-dt-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: who / where / when */}
                    <div className="min-w-0">
                      <Link
                        href={`/matches/${m.id}`}
                        className="truncate font-heading font-semibold hover:underline"
                      >
                        {t("matches.soloTitle", {
                          captain: m.captainName ?? t("matches.player"),
                        })}
                      </Link>
                      <div className="flex items-center gap-1 text-xs text-dt-dim">
                        <MapPinIcon className="size-3" aria-hidden />
                        {m.turfName}
                        {m.distanceKm != null ? ` · ${m.distanceKm.toFixed(1)} km` : ""}
                      </div>
                      <p className="match-score text-xs text-dt-dim">
                        {formatSlotDate(m.date, locale)} ·{" "}
                        {formatSlotTime(m.slotStart.slice(0, 5), locale)}
                      </p>
                    </div>
                    {/* Right: badge + live countdown */}
                    <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                      {own ? (
                        <span className="player-chip rounded-full border-dt-green/40 bg-dt-green/10 px-2.5 py-1 text-dt-green">
                          {t("player.yourMatchBadge")}
                        </span>
                      ) : null}
                      <KickoffCountdown
                        kickoffMs={slotStartEpochMs(
                          m.date,
                          m.slotStart.slice(0, 5)
                        )}
                      />
                    </div>
                  </div>
                  {!own ? (
                    <div className="mt-3">
                      <JoinRequestButton
                        matchId={m.id}
                        spots={m.openSpots.reduce(
                          (acc: number, s: { open: number }) => acc + s.open,
                          0
                        )}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Scheduled — bookings */}
      <section className="space-y-3">
        <h2 className="match-eyebrow">{t("player.scheduledTitle")}</h2>
        {bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            title={t("player.noBookingsTitle")}
            description={t("player.noBookingsDesc")}
            action={
              <Link
                href="/turfs"
                className="text-sm font-medium text-dt-green hover:underline"
              >
                {t("player.findTurf")}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => {
              const tone = STATUS_TONE[b.status] ?? "neutral"
              return (
                <li key={b.id}>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dt-line bg-dt-card p-4 text-sm transition-colors hover:bg-dt-card2/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading font-semibold">
                        {b.turfName}
                      </p>
                      <p className="match-score text-xs text-dt-dim">
                        {formatSlotDate(b.date, locale)} ·{" "}
                        {formatSlotTimeRange(
                          b.slotStart.slice(0, 5),
                          b.slotEnd.slice(0, 5),
                          locale
                        )}
                      </p>
                      <KickoffCountdown
                        kickoffMs={slotStartEpochMs(
                          b.date,
                          b.slotStart.slice(0, 5)
                        )}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {b.totalAmount ? (
                        <span className="tabular-nums text-dt-dim">
                          ৳{Number(b.totalAmount).toLocaleString()}
                        </span>
                      ) : null}
                      <StatusBadge status={tone} showIcon={false}>
                        {t(bookingStatusLabel(b.status))}
                      </StatusBadge>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Squad — friends */}
      <section className="space-y-3">
        <h2 className="match-eyebrow">{t("player.squadTitle")}</h2>
        <FriendsCard
          friends={friends}
          requests={friendRequests}
          friendIds={friends.map((f) => f.userId)}
        />
      </section>

      {/* Match log — history */}
      <section className="space-y-3">
        <h2 className="match-eyebrow">{t("player.matchLogTitle")}</h2>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-dt-line p-4 text-small text-dt-dim">
            {t("player.noHistory")}
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-dt-line bg-dt-card p-4 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/matches/${h.id}`}
                    className="truncate font-heading font-semibold hover:underline"
                  >
                    {h.turfName}
                  </Link>
                  <p className="match-score text-xs text-dt-dim">
                    {formatSlotDate(h.date, locale)} ·{" "}
                    {formatSlotTime(h.slotStart.slice(0, 5), locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {h.state === "completed" && h.homeScore != null ? (
                    <span className="match-score tabular-nums text-xs text-dt-txt">
                      {h.homeScore}–{h.awayScore}
                    </span>
                  ) : null}
                  <StatusBadge
                    status={MATCH_STATE_TONE[h.state] ?? "neutral"}
                    showIcon={false}
                  >
                    {t(matchStateLabel(h.state))}
                  </StatusBadge>
                  {h.asGuest ? (
                    <span className="shrink-0 rounded-full bg-dt-card2 px-2 py-0.5 text-xs font-medium text-dt-dim">
                      {t("player.historyGuestBadge")}
                    </span>
                  ) : null}
                  {/* Guest rows have no roster entry, so no "I played". */}
                  {h.state === "completed" && !h.asGuest && !h.playedConfirmedAt ? (
                    <ConfirmPlayedButton matchId={h.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recruit — referral (A3 MVP scaffold) */}
      <section className="rounded-xl border border-dt-line bg-dt-card p-4">
        <h2 className="match-eyebrow">{t("player.recruitTitle")}</h2>
        <p className="mt-1 text-small text-dt-dim">{t("player.inviteDesc")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-dt-line bg-dt-card2 px-2 py-1 text-sm">
            {inviteUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            className="match-btn-outline"
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
            className="text-xs text-dt-dim hover:underline"
          >
            {t("player.accountSettings")}
          </Link>
        </div>
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
