import Link from "next/link"
import { notFound } from "next/navigation"
import { MapPinIcon, ClockIcon, UserPlusIcon, ShieldPlusIcon, ShareIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { StatusBadge, EmptyState } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { MapView } from "@/components/map"
import { getWalletBalance } from "@/features/wallet/queries"
import { MATCH_FEE_BDT, formatBdt } from "@/lib/pricing"
import { MatchActions } from "@/components/matches/match-actions"
import { ButtonModal } from "@/components/matches/button-modal"
import { SquadInvitePanel } from "@/components/matches/squad-invite-panel"
import { PlayerSearch } from "@/components/matches/player-search"
import { InvitePlayerButton } from "@/components/matches/invite-player-button"
import { SquadGroups } from "@/components/matches/squad-groups"
import { SquadSpots } from "@/components/matches/squad-spots"
import { ClaimOpponentButton } from "@/components/matches/claim-opponent-button"
import { MatchmakingHelp } from "@/components/matches/matchmaking-help"
import { InvitationManager } from "@/components/matches/invitation-manager"
import { InvitationInbox } from "@/components/matches/invitation-inbox"
import { MatchInviteLink } from "@/components/matches/match-invite-link"
import { JoinBattle } from "@/components/matches/join-battle"
import { TeamChallengePanel } from "@/components/matches/team-challenge"
import { JoinRequestButton } from "@/components/player/join-request-button"
import { RequestManager } from "@/components/player/request-manager"
import { PlayerAvatar } from "@/components/player/player-avatar"
import {
  getMatch,
  getSquadCounts,
  listPendingInvitationsByMatch,
  listMyPendingInvitations,
  listMatchGuests,
  listRecentGuestsAddedBy,
  listInvitationOutcomes,
  listTeamChallenges,
  resolveSideCaptain,
} from "@/features/matches/queries"
import type { RecentGuestPick } from "@/features/matches/guests"
import { FORMATS, isMatchFormat, spotsLeft } from "@/features/matches/formats"
import { canClaimOpponentSide, isCaptainRole, rosterOpen } from "@/features/matches/authority"
import { listMyTeams } from "@/features/teams/queries"
import { listFriends } from "@/features/friends/queries"
import {
  listPendingPlayerRequestsByMatch,
  listAvailablePlayersNearTurf,
} from "@/features/player/queries"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import { POSITION_IDS } from "@/features/player/positions"
import { getTurfLatLng } from "@/features/turfs/queries"
import { getCurrentUser } from "@/lib/auth"
import {
  matchStateContextLabelKey,
  matchStateLabel,
  positionLabelKey,
  skillLabelKey,
} from "@/i18n/labels"

/** Localizes canonical identity ids; legacy free text renders as-is. */
function localizedIdentity(
  tr: (key: string) => string,
  raw: string | null
): string | null {
  if (!raw) return null
  const key = positionLabelKey(raw) ?? skillLabelKey(raw)
  return key ? tr(key) : raw
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ player_q?: string; player_pos?: string }>
}

const STATE_TONE: Record<string, "success" | "warning" | "neutral" | "primary"> = {
  open: "warning",
  confirmed: "success",
  roster_building: "primary",
  ready: "success",
  ongoing: "primary",
  completed: "success",
  cancelled: "neutral",
  disputed: "warning",
}

export default async function MatchDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  // `tr` (translator) — `t` is already bound to the turf in this page.
  const [match, tr] = await Promise.all([getMatch(id), getT()])
  if (!match) notFound()

  const user = await getCurrentUser()
  const {
    match: m,
    booking: b,
    turf: t,
    sides: legacySides,
    roster,
    awayCaptainName,
  } = match

  // Player-search filters (URL-driven; sanitized server-side).
  const playerQ = (sp.player_q ?? "").trim().slice(0, 50)
  const playerPos =
    sp.player_pos && (POSITION_IDS as readonly string[]).includes(sp.player_pos)
      ? sp.player_pos
      : undefined

  // Authority: home captain = creator, away captain = the opponent-side
  // claimant. Legacy team matches resolve through team roles (fallback
  // inside resolveSideCaptain).
  const mySide = user ? await resolveSideCaptain(m, user.id) : null
  const isHomeCaptain = mySide === "home"
  const managesMatch = mySide !== null

  // Friends not already on the roster — offered in the squad invite panel.
  let inviteFriends: { userId: string; name: string | null; phone: string }[] = []
  if (user && managesMatch && rosterOpen(m.state)) {
    const rosterIds = new Set(roster.map((p) => p.userId))
    inviteFriends = (await listFriends(user.id))
      .filter((f) => !rosterIds.has(f.userId))
      .map((f) => ({ userId: f.userId, name: f.name, phone: f.phone }))
  }

  // Squad capacity per side — squadSize is per SIDE.
  // Legacy rows are backfilled; fall back defensively for the format max.
  const squadSize =
    m.squadSize ??
    (isMatchFormat(m.matchType) ? FORMATS[m.matchType].maxSquad : FORMATS.fives.maxSquad)

  // Count-first capacity per side: identities (players + guests) + declared
  // placeholders fill the squad; pending invites are prospects competing
  // first-accept-wins for the open seats (getSquadCounts).
  const squadCounts = await getSquadCounts(m.id)
  const twoSides = squadCounts.length > 1
  const sideStats = squadCounts.map((c) => ({
    ...c,
    label:
      c.legacyTeamLabel ??
      (twoSides
        ? tr(c.side === "home" ? "matches.sideHome" : "matches.sideAway")
        : undefined),
    open: spotsLeft(squadSize, c.total, c.placeholders),
  }))
  const openBySide = Object.fromEntries(
    sideStats.map((s) => [s.side, s.open])
  ) as Partial<Record<"home" | "away", number>>

  // Pending player requests, outbound invitations, guests, and the captain's
  // quick-add picks from previous matches.
  let pendingRequests: {
    matchId: string; userId: string
    playerName: string | null; playerPhone: string
  }[] = []
  let pendingInvitations: Awaited<ReturnType<typeof listPendingInvitationsByMatch>> = []
  let guests: Awaited<ReturnType<typeof listMatchGuests>> = []
  let recentGuests: RecentGuestPick[] = []
  if (user && managesMatch && rosterOpen(m.state)) {
    const [allReqs, invites, guestRows, recent] = await Promise.all([
      listPendingPlayerRequestsByMatch(m.id),
      listPendingInvitationsByMatch(m.id),
      listMatchGuests(m.id),
      listRecentGuestsAddedBy(user.id, m.id),
    ])
    pendingRequests = allReqs.map((r) => ({
      matchId: r.matchId,
      userId: r.userId,
      playerName: r.playerName,
      playerPhone: r.playerPhone,
    }))
    pendingInvitations = invites
    guests = guestRows
    recentGuests = recent
  } else if (user) {
    guests = await listMatchGuests(m.id)
  }
  const myInvitations = user
    ? (await listMyPendingInvitations(user.id)).filter((inv) => inv.matchId === m.id)
    : []

  // Is the current user already on the roster?
  const onRoster = user ? roster.some((p) => p.userId === user.id) : false

  // Person-based opponent claim — anyone not part of the match can take the
  // away side while it's open (FCFS guarded in the action).
  const canClaim =
    !!user &&
    canClaimOpponentSide({
      state: m.state,
      captainId: m.captainId,
      awayCaptainId: m.awayCaptainId,
      userId: user.id,
      onRoster,
    })
  const homeCaptainWaitsForOpponent =
    isHomeCaptain && m.state === "open" && m.awayCaptainId === null

  // Matchmaking fee context for the claim/challenge CTAs (wallet-first).
  const walletBalance = canClaim ? await getWalletBalance(user.id) : 0
  const canAffordFee = walletBalance >= MATCH_FEE_BDT

  // Visitor teams they could challenge with (captain-role only).
  const myTeams =
    user && !managesMatch
      ? (await listMyTeams(user.id))
          .filter((tm) => isCaptainRole(tm.role))
          .map((tm) => ({ id: tm.id, name: tm.name }))
      : []

  // Team challenges (sent/past) and the join-battle log (managers only —
  // phone invites are masked, but the log is still captain-side context).
  const [challenges, outcomes] = await Promise.all([
    listTeamChallenges(m.id),
    managesMatch ? listInvitationOutcomes(m.id) : Promise.resolve([]),
  ])
  const showChallengePanel =
    (canClaim && (myTeams.length > 0 || isHomeCaptain)) || challenges.length > 0

  // Captains: solo players marked available near this turf (SS20/SS32).
  let nearbyPlayers: Awaited<ReturnType<typeof listAvailablePlayersNearTurf>> = []
  if (managesMatch && sideStats.some((s) => s.open > 0)) {
    const all = await listAvailablePlayersNearTurf(t.id, {
      q: playerQ || undefined,
      position: playerPos,
    })
    const rosterIds = new Set(roster.map((p) => p.userId))
    const requestedIds = new Set(pendingRequests.map((r) => r.userId))
    nearbyPlayers = all.filter(
      (p) => !rosterIds.has(p.userId) && !requestedIds.has(p.userId)
    )
  }
  const turfLatLng = nearbyPlayers.length > 0 ? await getTurfLatLng(t.id) : null

  const canConfirmResult =
    !!user &&
    m.state === "completed" &&
    m.resultStatus === "pending" &&
    user.id !== m.submittedBy &&
    managesMatch

  // Title: legacy team names when present, else the two captains' names.
  const captainName =
    roster.find((r) => r.userId === m.captainId)?.name ?? tr("matches.player")
  const legacyHome = legacySides.find((s) => s.side === "home")
  const legacyAway = legacySides.find((s) => s.side === "away")
  const title = legacyHome
    ? `${legacyHome.teamName}${legacyAway ? ` ${tr("player.vs")} ${legacyAway.teamName}` : ""}`
    : m.awayCaptainId
      ? `${captainName} ${tr("player.vs")} ${awayCaptainName ?? tr("matches.player")}`
      : tr("matches.soloTitle", { captain: captainName })

  // A rostered non-captain can leave while the roster is open.
  const canLeave =
    !!user && onRoster && !isHomeCaptain && m.awayCaptainId !== user.id && rosterOpen(m.state)

  // Join requests: match-level — the accepting captain seats the player on
  // their own side.
  const totalOpen = sideStats.reduce((acc, s) => acc + s.open, 0)
  const canRequestJoin =
    !!user && !onRoster && totalOpen > 0 && rosterOpen(m.state)

  return (
    <div className="match-hq mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="match-hq-glow" aria-hidden />
      <nav className="match-eyebrow">
        <Link href="/matches" className="hover:text-dt-txt">
          {tr("nav.matches")}
        </Link>{" "}
        / <span className="text-dt-txt">{tr("matches.breadcrumbMatch")}</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">
            <span className="match-grad">{title}</span>
          </h1>
          <StatusBadge status={STATE_TONE[m.state] ?? "neutral"} showIcon={false}>
            {tr(matchStateLabel(m.state))}
          </StatusBadge>
          <StatusBadge status="primary" showIcon={false}>
            {tr(`matches.format.${m.matchType}`)}
          </StatusBadge>
        </div>
        {matchStateContextLabelKey(m.state) ? (
          <p className="text-sm font-medium text-dt-dim">
            {tr(matchStateContextLabelKey(m.state)!)}
          </p>
        ) : null}
        <div className="flex items-center gap-1 text-sm text-dt-dim">
          <MapPinIcon className="size-4" aria-hidden />
          <Link href={`/turfs/${t.slug}`} className="hover:text-dt-txt">
            {t.name}
          </Link>
          {t.area ? ` · ${t.area}` : ""}
        </div>
        <div className="flex items-center gap-1 text-sm text-dt-dim">
          <ClockIcon className="size-4" aria-hidden />
          <span className="font-mono">
            {b.date} · {b.slotStart.slice(0, 5)}
          </span>
        </div>
      </header>

      {/* My pending squad invitations — the invitee's primary action sits up top */}
      {myInvitations.length > 0 ? (
        <InvitationInbox
          invitations={myInvitations.map((inv) => {
            const sideStat = sideStats.find((s) => s.side === inv.side)
            return {
              id: inv.id,
              invitedByName: inv.invitedByName,
              squadRoleWanted: inv.squadRoleWanted,
              turfName: inv.turfName,
              date: inv.date,
              slotStart: inv.slotStart,
              // Over-invite context: contested when more invites are out
              // than open seats; a filled side shows the "late" state.
              contested: (sideStat?.pending ?? 0) > (sideStat?.open ?? 0),
              seatAvailable: (sideStat?.open ?? 0) > 0,
            }
          })}
        />
      ) : null}

      {/* Opponent wanted — the person-based claim */}
      {canClaim ? (
        <section className="space-y-2 rounded-2xl border border-dt-green/40 bg-dt-green/5 p-4 shadow-[0_6px_30px_rgb(180_255_57/0.12)]">
          <h2 className="font-heading text-sm font-semibold">
            {tr("matches.claim.title")}
          </h2>
          <p className="text-sm text-dt-dim">{tr("matches.claim.desc")}</p>
          <p className="text-xs text-dt-dim">
            {tr("matches.feeBannerClaim", { amount: MATCH_FEE_BDT })}
          </p>
          <ClaimOpponentButton
            matchId={m.id}
            squadSize={squadSize}
            size="default"
            canAffordFee={canAffordFee}
          />
        </section>
      ) : homeCaptainWaitsForOpponent ? (
        <p className="rounded-2xl border border-dt-green/40 bg-dt-green/5 p-3 text-sm text-dt-dim">
          {tr("matches.claim.ownMatchNote")}
        </p>
      ) : null}

      {/* Score */}
      {m.state === "completed" || m.state === "ongoing" ? (
        <div className="flex items-center justify-center gap-4 rounded-2xl border border-dt-line bg-dt-card p-4">
          <span className="match-score text-3xl font-bold tabular-nums">
            {m.homeScore ?? 0}
          </span>
          <span className="text-dt-dim">–</span>
          <span className="match-score text-3xl font-bold tabular-nums">
            {m.awayScore ?? 0}
          </span>
          {m.resultStatus !== "confirmed" ? (
            <StatusBadge status="warning" showIcon={false}>
              {tr(`matches.result.${m.resultStatus}`)}
            </StatusBadge>
          ) : null}
        </div>
      ) : null}

      {/* Squad fill per side — count-first summary with the roster grid */}
      <div className="space-y-2">
        {sideStats.map((s) => (
          <SquadSpots
            key={s.side}
            matchId={m.id}
            matchType={m.matchType}
            squadSize={squadSize}
            side={s.side}
            starting={s.starting}
            total={s.total}
            pending={s.pending}
            placeholders={s.placeholders}
            label={s.label}
            editable={isHomeCaptain && rosterOpen(m.state)}
            canEditCount={mySide === s.side}
            countEditable={rosterOpen(m.state)}
            fillHref={
              managesMatch && rosterOpen(m.state)
                ? // Captain/recruiter: open tiles jump to the fill actions.
                  mySide === s.side
                  ? "#fill-squad"
                  : undefined
                : canRequestJoin
                  ? // Visitor: open tiles lead to the join request.
                    "#request-join"
                  : undefined
            }
            slotNames={[
              ...roster
                .filter((p) => p.side === s.side)
                .map((p) => p.name ?? p.phone ?? tr("matches.player")),
              ...guests
                .filter((g) => g.side === s.side)
                .map((g) => g.name),
            ]}
          />
        ))}
        {managesMatch && rosterOpen(m.state) ? (
          <p className="text-xs text-dt-dim">
            {tr("matches.squad.spotsExplainer")}
          </p>
        ) : null}
      </div>

      {/* Fill your squad — info on the page, actions in modals: nearby solo
          players, phone/friend/guest adds, and the shareable invite link */}
      {managesMatch && rosterOpen(m.state) ? (
        (() => {
          const mySideStats = sideStats.find((s) => s.side === mySide) ?? sideStats[0]
          if (!mySideStats || mySideStats.open <= 0) return null
          return (
            <section id="fill-squad" className="space-y-3">
              <div className="space-y-1">
                <h2 className="font-heading text-lg font-semibold">
                  {tr("matches.squad.fillTitle")}
                </h2>
                {totalOpen > 0 ? (
                  <p className="text-sm text-dt-dim">
                    {tr("matches.squad.fillDesc", { count: totalOpen })}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {/* Nearby solo players — search, map, and per-player invites */}
                <ButtonModal
                  label={tr("matches.squad.findPlayersCta")}
                  icon={<UserPlusIcon className="size-4" aria-hidden />}
                  triggerClassName="match-btn-lime"
                  title={tr("matches.nearbyTitle")}
                  description={tr("matches.nearbyDesc")}
                  defaultOpen={!!playerQ || !!playerPos}
                >
                  <PlayerSearch
                    matchId={m.id}
                    defaultQ={playerQ}
                    defaultPosition={playerPos}
                    hasFilter={!!playerQ || !!playerPos}
                  />
                  {nearbyPlayers.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-dt-line p-4 text-sm text-dt-dim">
                      {playerQ || playerPos
                        ? tr("matches.playerSearchEmpty")
                        : tr("matches.nearbyEmpty")}
                    </p>
                  ) : (
                    <>
                      <MapView
                        ariaLabel={tr("matches.nearbyMapAria")}
                        className="h-72"
                        markers={[
                          ...(turfLatLng
                            ? [
                                {
                                  id: "turf",
                                  lat: turfLatLng.lat,
                                  lng: turfLatLng.lng,
                                  label: t.name,
                                  kind: "turf" as const,
                                },
                              ]
                            : []),
                          ...nearbyPlayers.map((p) => {
                            const pos = localizedIdentity(tr, p.position)
                            return {
                              id: p.userId,
                              lat: p.lat,
                              lng: p.lng,
                              label: `${p.name ?? tr("matches.player")}${pos ? ` · ${pos}` : ""}`,
                              kind: "player" as const,
                            }
                          }),
                        ]}
                      />
                      <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
                        {nearbyPlayers.map((p) => {
                          const identity = [
                            localizedIdentity(tr, p.position),
                            localizedIdentity(tr, p.secondaryPosition),
                            localizedIdentity(tr, p.skill),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                          const display = resolveAvatarDisplay({
                            avatarType: p.avatarType,
                            avatarPublicId: p.avatarPublicId,
                            avatarPresetId: p.avatarPresetId,
                            name: p.name,
                          })
                          return (
                            <li
                              key={p.userId}
                              className="flex flex-col gap-3 bg-dt-card p-3 text-sm sm:flex-row sm:items-start"
                            >
                              <PlayerAvatar display={display} size="md" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-heading font-medium">
                                  {p.name ?? tr("matches.player")}
                                </p>
                                <p className="text-xs text-dt-dim">
                                  {identity || tr("matches.positionNotSet")}
                                </p>
                                {p.bio ? (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-dt-dim">
                                    &ldquo;{p.bio}&rdquo;
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-start sm:gap-0.5">
                                <span className="flex items-center gap-1 text-xs text-dt-dim">
                                  <MapPinIcon className="size-3" aria-hidden />
                                  {p.area || tr("matches.nearby")}
                                </span>
                                <span className="text-xs tabular-nums text-dt-dim">
                                  {p.distanceKm.toFixed(1)} km
                                </span>
                                <InvitePlayerButton
                                  matchId={m.id}
                                  playerId={p.userId}
                                  playerName={p.name ?? tr("matches.player")}
                                />
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </ButtonModal>

                {/* Phone / friend invites + guest adds */}
                <ButtonModal
                  label={tr("matches.squad.addPlayersCta")}
                  icon={<ShieldPlusIcon className="size-4" aria-hidden />}
                  variant="outline"
                  triggerClassName="match-btn-outline"
                  title={tr("matches.squad.addMembers")}
                >
                  <SquadInvitePanel
                    matchId={m.id}
                    friends={inviteFriends}
                    recentGuests={recentGuests}
                  />
                </ButtonModal>
              </div>
            </section>
          )
        })()
      ) : null}

      {/* Join requests from players (captain seats them on their side) */}
      {managesMatch && rosterOpen(m.state) && pendingRequests.length > 0 ? (
        <RequestManager
          side={mySide!}
          requests={pendingRequests}
        />
      ) : null}

      {/* Outbound invitations waiting for a reply */}
      {managesMatch && rosterOpen(m.state) && pendingInvitations.length > 0 ? (
        <InvitationManager
          matchId={m.id}
          invitations={pendingInvitations.map((inv) => ({
            id: inv.id,
            playerName: inv.playerName,
            playerPhone: inv.inviteePhone,
          }))}
        />
      ) : null}

      {/* Player matchmaking: join request for visitors while seats are open */}
      {canRequestJoin ? (
        <div id="request-join">
          <JoinRequestButton matchId={m.id} spots={totalOpen} />
        </div>
      ) : null}

      {/* Invite link — the shareable /m/<token> handle with copy + shares */}
      {user && (managesMatch || onRoster) ? (
        <ButtonModal
          label={tr("matches.squad.shareCta")}
          icon={<ShareIcon className="size-4" aria-hidden />}
          variant="outline"
          triggerClassName="match-btn-outline"
          title={tr("matches.inviteLink.label")}
          description={tr("matches.inviteLink.hint")}
        >
          <MatchInviteLink shareToken={m.shareToken} />
        </ButtonModal>
      ) : null}

      {/* Join battle log — invitation outcomes, first come first served */}
      {managesMatch && outcomes.length > 0 ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">
              {tr("matches.battle.title")}
            </h2>
            <span className="match-score text-xs text-destructive">
              {tr("matches.battle.live")}
            </span>
          </div>
          <JoinBattle outcomes={outcomes} openBySide={openBySide} />
        </section>
      ) : null}

      {/* Team challenges — send (visiting captains) / accept (home captain) */}
      {showChallengePanel ? (
        <div className="space-y-1">
          <p className="text-xs text-dt-dim">
            {tr("matches.feeBannerChallenge", { amount: MATCH_FEE_BDT })}
          </p>
          <TeamChallengePanel
            matchId={m.id}
            matchOpen={m.state === "open"}
            canChallenge={canClaim && myTeams.length > 0}
            isHomeCaptain={isHomeCaptain}
            myTeams={myTeams}
            challenges={challenges}
          />
        </div>
      ) : null}

      {/* Match room — full squad, Starting / Substitutes per side */}
      {roster.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">
              {tr("matches.squad.title")}
            </h2>
            <MatchmakingHelp />
          </div>
          <SquadGroups
            matchId={m.id}
            sides={sideStats.map((s) => ({
              side: s.side,
              legacyTeamLabel: s.legacyTeamLabel,
            }))}
            roster={roster.map((p) => ({
              userId: p.userId,
              name: p.name,
              phone: p.phone,
              side: p.side,
              role: p.role,
              squadRole: p.squadRole,
            }))}
            captainId={m.captainId}
            awayCaptainId={m.awayCaptainId}
            managedSides={mySide ? [mySide] : []}
            guests={guests.map((g) => ({
              id: g.id,
              side: g.side,
              name: g.name,
              phone: g.phone,
              position: g.position,
              jerseyNumber: g.jerseyNumber,
              linkedUserId: g.linkedUserId,
              squadRole: g.squadRole,
            }))}
          />
        </section>
      ) : null}


      {user ? (
        <MatchActions
          matchId={m.id}
          matchState={m.state}
          homeScore={m.homeScore}
          awayScore={m.awayScore}
          resultStatus={m.resultStatus}
          homeLabel={
            sideStats.find((s) => s.side === "home")?.label ??
            tr("matches.home")
          }
          awayLabel={
            sideStats.find((s) => s.side === "away")?.label ??
            tr("matches.away")
          }
          mySide={mySide}
          canLeave={canLeave}
          canConfirmResult={canConfirmResult}
        />
      ) : (
        <EmptyState
          title={tr("matches.signInTitle")}
          description={
            m.state === "open"
              ? tr("matches.signInAccept")
              : tr("matches.signInView")
          }
          action={
            <div className="flex justify-center gap-2">
              <Button render={<Link href="/login" />}>{tr("nav.signIn")}</Button>
              <Button variant="outline" render={<Link href="/register" />}>
                {tr("auth.createAccount")}
              </Button>
            </div>
          }
        />
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
