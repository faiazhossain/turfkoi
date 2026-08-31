import Link from "next/link"
import { notFound } from "next/navigation"
import { MapPinIcon, ClockIcon, UserPlusIcon, ShieldPlusIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { StatusBadge, EmptyState } from "@/components/shared"
import { MapView } from "@/components/map"
import { MatchActions } from "@/components/matches/match-actions"
import { PlayerSearch } from "@/components/matches/player-search"
import { InvitePlayerButton } from "@/components/matches/invite-player-button"
import { SquadGroups } from "@/components/matches/squad-groups"
import { SquadSpots } from "@/components/matches/squad-spots"
import { MatchmakingHelp } from "@/components/matches/matchmaking-help"
import { InvitationManager } from "@/components/matches/invitation-manager"
import { InvitationInbox } from "@/components/matches/invitation-inbox"
import { JoinRequestButton } from "@/components/player/join-request-button"
import { RequestManager } from "@/components/player/request-manager"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { getMatch, getSquadCounts, listPendingInvitationsByMatch, listMyPendingInvitations, listMatchGuests } from "@/features/matches/queries"
import { FORMATS, isMatchFormat, spotsLeft } from "@/features/matches/formats"
import { rosterOpen } from "@/features/matches/authority"
import { listTeamMembers, getTeamRole, listMyTeams } from "@/features/teams/queries"
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
  const { match: m, booking: b, turf: t, sides, roster } = match

  // Player-search filters (URL-driven; sanitized server-side).
  const playerQ = (sp.player_q ?? "").trim().slice(0, 50)
  const playerPos =
    sp.player_pos && (POSITION_IDS as readonly string[]).includes(sp.player_pos)
      ? sp.player_pos
      : undefined

  // The match captain (creator) — solo matches have no team sides, so
  // captaincy is the match-level authority.
  const isMatchCaptain = !!user && m.captainId === user.id

  // Determine the user's teams in this match (teams where they're captain/owner).
  const myTeamOptions: { teamId: string; teamName: string; side: "home" | "away" }[] = []
  let teamMembers: { userId: string; name: string | null; phone: string }[] = []
  let challengeTeams: { teamId: string; teamName: string }[] = []

  if (user) {
    for (const s of sides) {
      const role = await getTeamRole(s.teamId, user.id)
      if (role === "owner" || role === "captain") {
        myTeamOptions.push({
          teamId: s.teamId,
          teamName: s.teamName,
          side: s.side,
        })
      }
    }

    // Teams the user captains that are NOT in this match — they can challenge
    // the home team while the match is OPEN (FCFS: first challenger takes it).
    if (m.state === "open" && sides.length > 0) {
      const sideTeamIds = new Set(sides.map((s) => s.teamId))
      challengeTeams = (await listMyTeams(user.id))
        .filter(
          (tm) =>
            (tm.role === "owner" || tm.role === "captain") &&
            !sideTeamIds.has(tm.id)
        )
        .map((tm) => ({ teamId: tm.id, teamName: tm.name }))
    }

    // If the user manages a team in this match, load its members for the squad add panel.
    if (myTeamOptions.length > 0 && rosterOpen(m.state)) {
      teamMembers = await listTeamMembers(myTeamOptions[0].teamId)
    }
  }
  const canManageAfterTeams = isMatchCaptain || myTeamOptions.length > 0
  const managedTeamIds = myTeamOptions.map((tm) => tm.teamId)

  // Friends not already on the roster — offered in the squad invite panel.
  let inviteFriends: { userId: string; name: string | null; phone: string }[] = []
  if (user && canManageAfterTeams && rosterOpen(m.state)) {
    const rosterIds = new Set(roster.map((p) => p.userId))
    inviteFriends = (await listFriends(user.id))
      .filter((f) => !rosterIds.has(f.userId))
      .map((f) => ({ userId: f.userId, name: f.name, phone: f.phone }))
  }

  // Squad capacity per side — squadSize is per SIDE (solo = the one side).
  // Legacy rows are backfilled; fall back defensively for the format max.
  const squadSize =
    m.squadSize ??
    (isMatchFormat(m.matchType) ? FORMATS[m.matchType].maxSquad : FORMATS.fives.maxSquad)

  const sideGroups =
    sides.length > 0
      ? sides.map((s) => ({ teamId: s.teamId as string | null, teamName: s.teamName }))
      : [{ teamId: null, teamName: null as string | null }]
  // Count-first capacity per side: identities (players + guests) + pending
  // invites + declared placeholders fill the squad (getSquadCounts).
  const squadCounts = await getSquadCounts(m.id)
  const sideStats = sideGroups.map((g) => {
    const counts = squadCounts.find((c) => (c.teamId ?? null) === g.teamId)
    const players = roster.filter((p) => p.teamId === g.teamId)
    const total = counts?.total ?? players.length
    const pending = counts?.pending ?? 0
    const placeholders = counts?.placeholders ?? 0
    return {
      ...g,
      total,
      starting: counts?.starting ?? players.filter((p) => p.squadRole === "starting").length,
      pending,
      placeholders,
      open: spotsLeft(squadSize, total, pending, placeholders),
    }
  })
  const myManagedSideTeamIds = new Set(myTeamOptions.map((tm) => tm.teamId))

  // Load pending player requests for whoever manages this match (match
  // captain or a side-team captain). Also load outbound pending invitations,
  // temp guests, and — for the signed-in user — their own pending invites.
  let pendingRequests: {
    matchId: string; userId: string
    playerName: string | null; playerPhone: string
  }[] = []
  let pendingInvitations: Awaited<ReturnType<typeof listPendingInvitationsByMatch>> = []
  let guests: Awaited<ReturnType<typeof listMatchGuests>> = []
  if (canManageAfterTeams && rosterOpen(m.state)) {
    const [allReqs, invites, guestRows] = await Promise.all([
      listPendingPlayerRequestsByMatch(m.id),
      listPendingInvitationsByMatch(m.id),
      listMatchGuests(m.id),
    ])
    pendingRequests = allReqs.map((r) => ({
      matchId: r.matchId,
      userId: r.userId,
      playerName: r.playerName,
      playerPhone: r.playerPhone,
    }))
    pendingInvitations = invites
    guests = guestRows
  } else if (user) {
    guests = await listMatchGuests(m.id)
  }
  const myInvitations = user
    ? (await listMyPendingInvitations(user.id)).filter((inv) => inv.matchId === m.id)
    : []

  // Is the current user already on the roster?
  const onRoster = user ? roster.some((p) => p.userId === user.id) : false

  // Captains: solo players marked available near this turf (SS20/SS32).
  let nearbyPlayers: Awaited<ReturnType<typeof listAvailablePlayersNearTurf>> = []
  if (canManageAfterTeams && sideStats.some((s) => s.open > 0)) {
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
    myTeamOptions.length > 0

  const home = sides.find((s) => s.side === "home")
  const away = sides.find((s) => s.side === "away")

  // Solo matches have no home team — the captain's name is the title.
  const captainName =
    roster.find((r) => r.userId === m.captainId)?.name ?? tr("matches.player")
  const title = home
    ? `${home.teamName}${away ? ` vs ${away.teamName}` : ""}`
    : tr("matches.soloTitle", { captain: captainName })

  // A rostered non-captain can leave while the roster is open.
  const canLeave =
    !!user && onRoster && !isMatchCaptain && rosterOpen(m.state)

  // Join requests open up for solo matches while still OPEN (recruiting);
  // team matches keep their existing confirmed/roster_building behaviour.
  const openSpots = sideStats
    .filter((s) => s.open > 0)
    .map((s) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      open: s.open,
    }))
  const canRequestJoin =
    !!user &&
    !onRoster &&
    myTeamOptions.length === 0 &&
    openSpots.length > 0 &&
    rosterOpen(m.state) &&
    (m.state !== "open" || sides.length === 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/matches" className="hover:text-foreground">
          {tr("nav.matches")}
        </Link>{" "}
        / <span className="text-foreground">{tr("matches.breadcrumbMatch")}</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{title}</h1>
          <StatusBadge status={STATE_TONE[m.state] ?? "neutral"} showIcon={false}>
            {tr(matchStateLabel(m.state))}
          </StatusBadge>
          <StatusBadge status="primary" showIcon={false}>
            {tr(`matches.format.${m.matchType}`)}
          </StatusBadge>
        </div>
        {matchStateContextLabelKey(m.state, sides.length === 0) ? (
          <p className="text-sm font-medium text-muted-foreground">
            {tr(matchStateContextLabelKey(m.state, sides.length === 0)!)}
          </p>
        ) : null}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPinIcon className="size-4" aria-hidden />
          <Link href={`/turfs/${t.slug}`} className="hover:text-foreground">
            {t.name}
          </Link>
          {t.area ? ` · ${t.area}` : ""}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          <span className="font-mono">
            {b.date} · {b.slotStart.slice(0, 5)}
          </span>
        </div>
      </header>

      {/* Score */}
      {m.state === "completed" || m.state === "ongoing" ? (
        <div className="flex items-center justify-center gap-4 rounded-lg border border-border bg-card p-4">
          <span className="font-heading text-2xl font-bold tabular-nums">
            {m.homeScore ?? 0}
          </span>
          <span className="text-muted-foreground">–</span>
          <span className="font-heading text-2xl font-bold tabular-nums">
            {m.awayScore ?? 0}
          </span>
          {m.resultStatus !== "confirmed" ? (
            <StatusBadge status="warning" showIcon={false}>
              {tr(`matches.result.${m.resultStatus}`)}
            </StatusBadge>
          ) : null}
        </div>
      ) : null}

      {/* Squad fill per side — count-first summary */}
      <div className="space-y-2">
        {sideStats.map((s) => (
          <SquadSpots
            key={s.teamId ?? "solo"}
            matchId={m.id}
            matchType={m.matchType}
            squadSize={squadSize}
            teamId={s.teamId}
            starting={s.starting}
            total={s.total}
            pending={s.pending}
            placeholders={s.placeholders}
            label={s.teamName ?? undefined}
            editable={isMatchCaptain && rosterOpen(m.state)}
            canEditCount={
              s.teamId === null
                ? isMatchCaptain
                : myManagedSideTeamIds.has(s.teamId)
            }
            countEditable={rosterOpen(m.state)}
          />
        ))}
      </div>

      {/* What do I do next? — one obvious primary action per stage */}
      {canManageAfterTeams && rosterOpen(m.state) ? (
        (() => {
          const mySide = sideStats.find(
            (s) =>
              s.teamId === null
                ? isMatchCaptain && sides.length === 0
                : myManagedSideTeamIds.has(s.teamId!)
          ) ?? sideStats[0]
          if (!mySide) return null
          if (mySide.open > 0) {
            return (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="#nearby"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none"
                >
                  <UserPlusIcon className="size-4" aria-hidden />
                  {tr("matches.squad.findPlayersCta")}
                </a>
                <a
                  href="#add-guest"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted/40"
                >
                  <ShieldPlusIcon className="size-4" aria-hidden />
                  {tr("matches.squad.addGuestCta")}
                </a>
              </div>
            )
          }
          // Solo + open: the CTA row above already covers it; full solo
          // squad needs no next action.
          if (
            m.state === "open" &&
            sides.length > 0 &&
            mySide.open === 0
          ) {
            return (
              <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm text-muted-foreground">
                {tr("matches.squad.findOpponentHint")}
              </p>
            )
          }
          return null
        })()
      ) : null}

      {/* Player matchmaking: join request + captain request management */}
      {canRequestJoin ? (
        <JoinRequestButton matchId={m.id} spots={openSpots} />
      ) : null}

      {canManageAfterTeams && pendingRequests.length > 0 ? (
        <RequestManager
          teamId={myTeamOptions[0]?.teamId ?? null}
          requests={pendingRequests}
        />
      ) : null}

      {/* My pending squad invitations for this match */}
      {myInvitations.length > 0 ? (
        <InvitationInbox
          invitations={myInvitations.map((inv) => ({
            id: inv.id,
            invitedByName: inv.invitedByName,
            squadRoleWanted: inv.squadRoleWanted,
            turfName: inv.turfName,
            date: inv.date,
            slotStart: inv.slotStart,
          }))}
        />
      ) : null}

      {/* Outbound pending invitations (managers can cancel) */}
      {canManageAfterTeams && pendingInvitations.length > 0 ? (
        <InvitationManager
          matchId={m.id}
          invitations={pendingInvitations.map((inv) => ({
            id: inv.id,
            playerName: inv.playerName,
            playerPhone: inv.inviteePhone,
          }))}
        />
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
            sides={sides.map((s) => ({
              teamId: s.teamId,
              teamName: s.teamName,
              side: s.side,
            }))}
            roster={roster.map((p) => ({
              userId: p.userId,
              name: p.name,
              phone: p.phone,
              teamId: p.teamId,
              role: p.role,
              squadRole: p.squadRole,
            }))}
            captainId={m.captainId}
            managedTeamIds={managedTeamIds}
            isMatchCaptain={isMatchCaptain}
            guests={guests.map((g) => ({
              id: g.id,
              teamId: g.teamId,
              name: g.name,
              phone: g.phone,
              linkedUserId: g.linkedUserId,
              squadRole: g.squadRole,
            }))}
          />
        </section>
      ) : null}

      {/* Captains: solo players available near this turf */}
      {canManageAfterTeams && sideStats.some((s) => s.open > 0) ? (
        <section id="nearby" className="scroll-mt-20 space-y-3">
          <h2 className="font-heading text-lg font-semibold">
            {tr("matches.nearbyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{tr("matches.nearbyDesc")}</p>
          {sideStats.every((s) => s.open === 0) ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {tr("matches.rosterFullHint")}
            </p>
          ) : (
            <PlayerSearch
              matchId={m.id}
              defaultQ={playerQ}
              defaultPosition={playerPos}
              hasFilter={!!playerQ || !!playerPos}
            />
          )}
          {nearbyPlayers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
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
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
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
                      className="flex items-start gap-3 bg-card p-3 text-sm"
                    >
                      <PlayerAvatar display={display} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading font-medium">
                          {p.name ?? tr("matches.player")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {identity || tr("matches.positionNotSet")}
                        </p>
                        {p.bio ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            &ldquo;{p.bio}&rdquo;
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="size-3" aria-hidden />
                          {p.area || tr("matches.nearby")}
                        </span>
                        <span className="tabular-nums">
                          {p.distanceKm.toFixed(1)} km
                        </span>
                      </div>
                      {!sideStats.every((s) => s.open === 0) ? (
                        <InvitePlayerButton
                          matchId={m.id}
                          playerId={p.userId}
                          playerName={p.name ?? tr("matches.player")}
                          disabled={sideStats.every((s) => s.open === 0)}
                        />
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>
      ) : null}

      {user ? (
        <MatchActions
          matchId={m.id}
          matchState={m.state}
          homeScore={m.homeScore}
          awayScore={m.awayScore}
          resultStatus={m.resultStatus}
          sides={sides.map((s) => ({
            teamId: s.teamId,
            teamName: s.teamName,
            side: s.side,
          }))}
          myTeams={myTeamOptions}
          challengeTeams={challengeTeams}
          teamMembers={teamMembers}
          friends={inviteFriends}
          isMatchCaptain={isMatchCaptain}
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
        />
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
