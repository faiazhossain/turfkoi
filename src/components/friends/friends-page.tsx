"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, SearchIcon, XIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"

import { PlayerAvatar } from "@/components/player/player-avatar"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import { isPresenceOnline } from "@/lib/presence"
import { MapView, type MapMarker } from "@/components/map"
import { InviteToMatchDialog } from "@/components/players/invite-to-match-dialog"
import {
  sendFriendRequestAction,
  respondToFriendRequestAction,
  removeFriendAction,
} from "@/features/friends/actions"
import { searchPlayersAction } from "@/features/player/actions"
import type {
  FriendCandidateRow,
  FriendRow,
  PendingRequestRow,
} from "@/features/friends/queries"
import type { PlayerCardRow } from "@/features/player/queries"

type Tab = "friends" | "requests" | "sent"

/*
 * friends.html palette via the shared dt-* Tailwind colors (registered in
 * globals.css @theme, contract in docs/TAILWIND_MIGRATION.md) — explicit
 * per-page control without the semantic token theme, one grep from a
 * re-skin. dt-line/dt-input sit a step above the raw mockup hex to hold the
 * contrast floors asserted in src/app/__tests__/contrast.test.ts.
 */

const CARD =
  "rounded-[14px] border border-dt-line bg-dt-card2 transition-colors"

/** Solid green CTA (mockup .btn-primary: green→teal gradient, dark text). */
function GreenButton({
  onClick,
  loading,
  disabled,
  children,
  className = "",
  small = true,
}: {
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  className?: string
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-br from-dt-green to-dt-teal font-bold text-dt-ink shadow-[0_4px_14px_rgba(34,197,94,0.3)] transition active:scale-95 disabled:opacity-60 ${
        small ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
      } ${className}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

/** Solid blue action (mockup .btn-blue). */
function BlueButton({
  onClick,
  loading,
  children,
  className = "",
}: {
  onClick?: () => void
  loading?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-dt-blue px-2.5 py-1.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(59,130,246,0.3)] transition active:scale-95 disabled:opacity-60 ${className}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

/** Outlined green (mockup .btn-outline-green). */
function OutlineGreenButton({
  onClick,
  loading,
  children,
}: {
  onClick?: () => void
  loading?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-dt-green px-2.5 py-1.5 text-xs font-bold text-dt-green transition hover:bg-dt-green/10 active:scale-95 disabled:opacity-60"
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

/** Bare ghost / icon action (mockup .btn-ghost). */
function GhostButton({
  onClick,
  loading,
  label,
  children,
  danger = false,
}: {
  onClick?: () => void
  loading?: boolean
  label?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-[10px] px-2 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-60 ${
        danger
          ? "text-dt-red hover:bg-dt-red/10"
          : "text-dt-txt hover:bg-dt-card"
      }`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}

/**
 * Player Network hub (/friends), mirroring the approved friends.html mockup:
 * inline search box with icon trigger, three pill tabs (Friends / Requests /
 * Sent), section dividers with Online/Offline legends, player cards with
 * avatar + status dot + ID chip + position, and per-friend match invites.
 * Styled with the shared dt-* Tailwind colors (see palette above), page-by-page.
 */
export function FriendsPage({
  myPlayerId,
  friends,
  requests,
  sent,
  suggestions,
  friendIds,
}: {
  myPlayerId: string | null
  friends: FriendRow[]
  requests: PendingRequestRow[]
  sent: PendingRequestRow[]
  /** Recently-available players to suggest (server-filtered for friends/pending/blocks). */
  suggestions: FriendCandidateRow[]
  /** Ids already befriended — used to hide stale search hits. */
  friendIds: string[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("friends")
  const [pending, start] = useTransition()
  const [term, setTerm] = useState("")
  const [hits, setHits] = useState<PlayerCardRow[] | null>(null)
  const [sentSuggestions, setSentSuggestions] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [suggestionView, setSuggestionView] = useState<"map" | "list">("map")
  const [inviteTarget, setInviteTarget] = useState<{ userId: string; name: string } | null>(
    null
  )
  const searchRef = useRef<HTMLInputElement>(null)

  const online = friends.filter((f) => isPresenceOnline(f.lastSeenAt))
  const offline = friends.filter((f) => !isPresenceOnline(f.lastSeenAt))

  function search() {
    start(async () => {
      const rows = await searchPlayersAction(term)
      setHits(rows)
    })
  }

  function request(userId: string) {
    start(async () => {
      const res = await sendFriendRequestAction({ userId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.requestSent"))
      setHits((prev) => (prev ?? []).filter((h) => h.userId !== userId))
      setSentSuggestions((prev) => [...prev, userId])
    })
  }

  function respond(friendshipId: string, accept: boolean) {
    start(async () => {
      const res = await respondToFriendRequestAction({ friendshipId, accept })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t(accept ? "friends.acceptedToast" : "friends.declinedToast"))
    })
  }

  function cancelSent(friendshipId: string) {
    start(async () => {
      // removeFriendAction retracts a pending request from the sender side.
      const res = await removeFriendAction({ friendshipId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.declinedToast"))
    })
  }

  function copyId() {
    if (!myPlayerId) return
    navigator.clipboard?.writeText(myPlayerId).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const searched = hits !== null
  const visibleHits = (hits ?? []).filter((h) => !friendIds.includes(h.userId))
  const visibleSuggestions = suggestions.filter(
    (s) => !friendIds.includes(s.userId) && !sentSuggestions.includes(s.userId)
  )
  // Map tab only makes sense when pins exist (viewer + candidate coords).
  const showSuggestionMap = visibleSuggestions.some(
    (s) => s.lat != null && s.lng != null
  )

  return (
    <div className="text-dt-txt">
      <div className="space-y-4">
        {/* Your Player ID — mockup's blue id-chip */}
        {myPlayerId && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={copyId}
              title={t("players.copyId")}
              className="inline-flex items-center gap-2 rounded-xl border border-dt-blue/30 bg-dt-blue/10 px-4 py-2 font-mono text-sm font-bold tracking-wide text-dt-blue transition hover:bg-dt-blue/15"
            >
              {myPlayerId}
              {copied ? (
                <CheckIcon className="size-4" aria-hidden />
              ) : (
                <CopyIcon className="size-4" aria-hidden />
              )}
            </button>
          </div>
        )}

        {/* Search box (mockup: input + icon trigger inside one bordered pill) */}
        <div className="flex items-center gap-2 rounded-[14px] border border-dt-line bg-dt-card px-3">
          <input
            ref={searchRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search()
            }}
            placeholder={t("players.searchPlaceholder")}
            maxLength={50}
            className="h-11 flex-1 bg-transparent text-sm text-dt-txt outline-none placeholder:text-dt-dim"
          />
          <button
            type="button"
            onClick={search}
            disabled={term.trim().length < 2 || pending}
            aria-label={t("friends.search")}
            className="text-dt-green disabled:opacity-40"
          >
            <SearchIcon className="size-5" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-dt-dim">
          {t("players.searchHint", { code: myPlayerId ?? "DT-XXXXXX" })}
        </p>

        {/* Search results (same player-card row as the friends list) */}
        {searched ? (
          visibleHits.length > 0 ? (
            <ul className="space-y-2">
              {visibleHits.map((h) => (
                <PlayerRow
                  key={h.userId}
                  row={{
                    userId: h.userId,
                    name: h.name,
                    playerId: h.playerId,
                    username: h.username,
                    position: h.position,
                    lastSeenAt: h.lastSeenAt,
                    avatarType: h.avatarType,
                    avatarPresetId: h.avatarPresetId,
                    avatarPublicId: h.avatarPublicId,
                  }}
                  onClick={() => h.playerId && router.push(`/players/${h.playerId}`)}
                >
                  <GreenButton onClick={() => request(h.userId)} loading={pending}>
                    {t("friends.addFriend")}
                  </GreenButton>
                </PlayerRow>
              ))}
            </ul>
          ) : (
            <EmptyBlock icon="🔍" title={t("players.searchEmptyTitle")} desc={t("players.searchEmptyDesc")} />
          )
        ) : null}

        {/* Pills tabs (mockup: active pill goes BLUE) */}
        <div className="grid grid-cols-3 gap-2" role="tablist">
          {(
            [
              ["friends", t("friends.tabFriends"), friends.length, false],
              ["requests", t("friends.tabRequests"), requests.length, requests.length > 0],
              ["sent", t("friends.tabSent"), sent.length, false],
            ] as const
          ).map(([key, label, count, alert]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-xl border px-2 py-2.5 text-[12.5px] font-bold transition ${
                tab === key
                  ? "border-dt-blue bg-dt-blue/10 text-dt-blue"
                  : "border-dt-line bg-dt-card text-dt-dim hover:bg-dt-card2"
              }`}
            >
              {label}{" "}
              <span className={alert && tab !== key ? "text-dt-red" : undefined}>
                ({count})
              </span>
            </button>
          ))}
        </div>

        {tab === "friends" ? (
          <>
            {/* Suggestions: recently-available players (server-filtered) */}
            {visibleSuggestions.length > 0 ? (
              <div className="space-y-1">
                <SectionDivider
                  legend={`${t("friends.suggestionsTitle")} · ${visibleSuggestions.length}`}
                  dot="online"
                />
                <p className="px-1 text-xs text-dt-dim">
                  {t("friends.suggestionsDesc")}
                </p>
                {showSuggestionMap ? (
                  /* Map / Players toggle — one view at a time */
                  <div className="grid grid-cols-2 gap-2" role="tablist">
                    {(
                      [
                        ["map", t("friends.mapTab")],
                        ["list", t("friends.playersTab")],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={suggestionView === key}
                        onClick={() => setSuggestionView(key)}
                        className={`rounded-xl border px-2 py-2 text-[12.5px] font-bold transition ${
                          suggestionView === key
                            ? "border-dt-blue bg-dt-blue/10 text-dt-blue"
                            : "border-dt-line bg-dt-card text-dt-dim hover:bg-dt-card2"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {showSuggestionMap && suggestionView === "map" ? (
                  <MapView
                    ariaLabel={t("friends.suggestionsMapAria")}
                    className="h-64 rounded-[14px]"
                    markers={suggestionMarkers(visibleSuggestions)}
                  />
                ) : (
                  <ul className="space-y-2">
                    {visibleSuggestions.map((s) => (
                      <PlayerRow
                        key={s.userId}
                        row={{
                          userId: s.userId,
                          name: s.name,
                          playerId: s.playerId,
                          username: s.username,
                          position: s.position,
                          lastSeenAt: null,
                          avatarType: s.avatarType,
                          avatarPresetId: s.avatarPresetId,
                          avatarPublicId: s.avatarPublicId,
                        }}
                        onClick={() =>
                          s.playerId && router.push(`/players/${s.playerId}`)
                        }
                      >
                        <GreenButton onClick={() => request(s.userId)} loading={pending}>
                          {t("friends.addFriend")}
                        </GreenButton>
                      </PlayerRow>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "friends" ? (
          friends.length === 0 ? (
            <div className="py-8 text-center">
              <EmptyBlock
                icon="⚽"
                title={t("friends.emptyTitle")}
                desc={t("friends.emptyDesc")}
              />
              <GreenButton
                small={false}
                className="mt-3"
                onClick={() => {
                  searchRef.current?.focus()
                }}
              >
                {t("friends.findPlayers")}
              </GreenButton>
            </div>
          ) : (
            <div className="space-y-1">
              <SectionDivider
                legend={`${t("friends.online")} · ${online.length}`}
                dot="online"
              />
              {online.length === 0 ? (
                <p className="px-1 pb-2 text-xs text-dt-dim">
                  {t("friends.emptyOnline")}
                </p>
              ) : (
                online.map((f) => (
                  <PlayerRow key={f.friendshipId} row={f}>
                    <BlueButton
                      onClick={() =>
                        setInviteTarget({ userId: f.userId, name: f.name ?? "" })
                      }
                      loading={pending}
                    >
                      {t("friends.invite")}
                    </BlueButton>
                  </PlayerRow>
                ))
              )}
              <SectionDivider
                legend={`${t("friends.offline")} · ${offline.length}`}
                dot="offline"
              />
              {offline.length === 0 ? (
                <p className="px-1 text-xs text-dt-dim">{t("friends.emptyOffline")}</p>
              ) : (
                offline.map((f) => (
                  <PlayerRow key={f.friendshipId} row={f}>
                    <BlueButton
                      onClick={() =>
                        setInviteTarget({ userId: f.userId, name: f.name ?? "" })
                      }
                      loading={pending}
                    >
                      {t("friends.invite")}
                    </BlueButton>
                  </PlayerRow>
                ))
              )}
            </div>
          )
        ) : null}

        {tab === "requests" ? (
          requests.length === 0 ? (
            <EmptyBlock icon="📭" title={t("friends.emptyRequests")} desc={t("friends.emptyRequestsDesc")} />
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <PlayerRow
                  key={r.friendshipId}
                  row={{
                    userId: r.userId,
                    name: r.name,
                    playerId: null,
                    username: null,
                    position: null,
                    lastSeenAt: null,
                    avatarType: r.avatarType,
                    avatarPresetId: r.avatarPresetId,
                    avatarPublicId: r.avatarPublicId,
                  }}
                  subtitle={t("friends.incomingRequest")}
                >
                  <GreenButton
                    onClick={() => respond(r.friendshipId, true)}
                    loading={pending}
                  >
                    {t("friends.accept")}
                  </GreenButton>
                  <GhostButton
                    label={t("friends.decline")}
                    danger
                    onClick={() => respond(r.friendshipId, false)}
                    loading={pending}
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </GhostButton>
                </PlayerRow>
              ))}
            </ul>
          )
        ) : null}

        {tab === "sent" ? (
          sent.length === 0 ? (
            <EmptyBlock icon="📤" title={t("friends.emptySent")} desc={t("friends.emptySentDesc")} />
          ) : (
            <ul className="space-y-2">
              {sent.map((r) => (
                <PlayerRow
                  key={r.friendshipId}
                  row={{
                    userId: r.userId,
                    name: r.name,
                    playerId: null,
                    username: null,
                    position: null,
                    lastSeenAt: null,
                    avatarType: r.avatarType,
                    avatarPresetId: r.avatarPresetId,
                    avatarPublicId: r.avatarPublicId,
                  }}
                >
                  <OutlineGreenButton
                    onClick={() => cancelSent(r.friendshipId)}
                    loading={pending}
                  >
                    {t("friends.cancelRequest")}
                  </OutlineGreenButton>
                </PlayerRow>
              ))}
            </ul>
          )
        ) : null}
      </div>

      <InviteToMatchDialog
        key={inviteTarget?.userId ?? "none"}
        target={inviteTarget}
        onClose={() => setInviteTarget(null)}
      />
    </div>
  )
}

/** Player pins for the suggestions map — area / distance in the popup label. */
function suggestionMarkers(rows: FriendCandidateRow[]): MapMarker[] {
  return rows
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      id: r.userId,
      lat: r.lat as number,
      lng: r.lng as number,
      label: [
        r.name ?? "",
        r.distanceKm != null
          ? `${r.distanceKm.toFixed(1)} km`
          : (r.area ?? ""),
      ]
        .filter(Boolean)
        .join(" · "),
      href: r.playerId ? `/players/${r.playerId}` : undefined,
      kind: "player" as const,
    }))
}

/** Mockup empty state: big emoji / title / dim description. */
function EmptyBlock({
  icon,
  title,
  desc,
}: {
  icon: string
  title: string
  desc?: string
}) {
  return (
    <div className="py-8 text-center">
      <div className="text-4xl opacity-70">{icon}</div>
      <h4 className="mt-2 text-base font-bold">{title}</h4>
      {desc ? <p className="mt-1 text-sm text-dt-dim">{desc}</p> : null}
    </div>
  )
}

/** Mockup's section divider: legend chip + rule line. */
function SectionDivider({
  legend,
  dot,
}: {
  legend: string
  dot: "online" | "offline"
}) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dt-line bg-dt-card px-2.5 py-1 text-[10.5px] font-semibold text-dt-dim">
        <span
          aria-hidden
          className={`size-2 rounded-full ${
            dot === "online" ? "bg-dt-green" : "bg-dt-off"
          }`}
        />
        {legend}
      </span>
      <span className="h-px flex-1 bg-dt-line" aria-hidden />
    </div>
  )
}

interface RowLike {
  userId: string
  name: string | null
  playerId: string | null
  username: string | null
  position: string | null
  lastSeenAt: Date | null
  avatarType: string | null
  avatarPresetId: string | null
  avatarPublicId: string | null
}

/**
 * Mockup player card: avatar with presence dot, name + @username, DeshiTurf
 * ID chip (blue mono), position — actions on the right.
 */
function PlayerRow({
  row,
  subtitle,
  onClick,
  children,
}: {
  row: RowLike
  /** Secondary line replacing ID/position (request rows). */
  subtitle?: string
  onClick?: () => void
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  const online = isPresenceOnline(row.lastSeenAt)
  const info = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-bold text-dt-txt">{row.name ?? ""}</span>
        {row.username ? (
          <span className="truncate text-xs font-semibold text-dt-dim">
            @{row.username}
          </span>
        ) : null}
      </span>
      {subtitle ? (
        <span className="mt-0.5 block truncate text-xs text-dt-dim">{subtitle}</span>
      ) : (
        <span className="mt-0.5 flex items-center gap-2">
          {row.playerId ? (
            <span className="rounded-md bg-dt-blue/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-dt-blue">
              {row.playerId}
            </span>
          ) : null}
          {row.position ? (
            <span className="text-[11px] font-bold text-dt-dim">{row.position}</span>
          ) : null}
        </span>
      )}
    </>
  )

  return (
    <li
      className={`flex items-center gap-3 p-3 ${CARD} hover:border-dt-blue`}
    >
      <span className="relative shrink-0">
        <PlayerAvatar
          display={resolveAvatarDisplay({
            avatarType: row.avatarType,
            avatarPublicId: row.avatarPublicId,
            avatarPresetId: row.avatarPresetId,
            name: row.name,
          })}
          size="md"
        />
        {row.lastSeenAt !== null ? (
          <span
            aria-hidden
            title={online ? t("friends.online") : t("friends.offline")}
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-dt-card2 ${
              online ? "bg-dt-green" : "bg-dt-off"
            }`}
          />
        ) : null}
      </span>
      {onClick ? (
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
          {info}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{info}</div>
      )}
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  )
}
