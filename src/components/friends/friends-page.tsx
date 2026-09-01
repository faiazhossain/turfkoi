"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, SearchIcon, XIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import { isPresenceOnline } from "@/lib/presence"
import { InviteToMatchDialog } from "@/components/players/invite-to-match-dialog"
import {
  sendFriendRequestAction,
  respondToFriendRequestAction,
  removeFriendAction,
} from "@/features/friends/actions"
import { searchPlayersAction } from "@/features/player/actions"
import type { FriendRow, PendingRequestRow } from "@/features/friends/queries"
import type { PlayerCardRow } from "@/features/player/queries"

type Tab = "friends" | "requests" | "sent"

/**
 * Player Network hub (/friends), mirroring the approved friends.html mockup:
 * inline search box with icon trigger, three pill tabs (Friends / Requests /
 * Sent), section dividers with Online/Offline legends, player cards with
 * avatar + status dot + ID chip + position, and per-friend match invites.
 */
export function FriendsPage({
  myPlayerId,
  friends,
  requests,
  sent,
  friendIds,
}: {
  myPlayerId: string | null
  friends: FriendRow[]
  requests: PendingRequestRow[]
  sent: PendingRequestRow[]
  /** Ids already befriended — used to hide stale search hits. */
  friendIds: string[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("friends")
  const [pending, start] = useTransition()
  const [term, setTerm] = useState("")
  const [hits, setHits] = useState<PlayerCardRow[] | null>(null)
  const [copied, setCopied] = useState(false)
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

  return (
    <div className="space-y-4">
      {/* Your Player ID — the shareable handle (id-chip from the mockup) */}
      {myPlayerId && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={copyId}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 font-mono text-sm font-bold tracking-wide text-primary transition-colors hover:bg-primary/15"
            title={t("players.copyId")}
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
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Input
          ref={searchRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search()
          }}
          placeholder={t("players.searchPlaceholder")}
          className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          maxLength={50}
        />
        <button
          type="button"
          onClick={search}
          disabled={term.trim().length < 2 || pending}
          aria-label={t("friends.search")}
          className="text-primary disabled:opacity-40"
        >
          <SearchIcon className="size-5" aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
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
                <Button size="xs" onClick={() => request(h.userId)} loading={pending}>
                  {t("friends.addFriend")}
                </Button>
              </PlayerRow>
            ))}
          </ul>
        ) : (
          // Mockup empty state: icon / title / hint
          <div className="py-8 text-center">
            <div className="text-4xl opacity-70">🔍</div>
            <h4 className="mt-2 font-heading text-base font-semibold">
              {t("players.searchEmptyTitle")}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("players.searchEmptyDesc")}
            </p>
          </div>
        )
      ) : null}

      {/* Pills tabs (mockup: three equal pills, active = tinted) */}
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
            className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors ${
              tab === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}{" "}
            <span className={alert && tab !== key ? "text-destructive" : undefined}>
              ({count})
            </span>
          </button>
        ))}
      </div>

      {tab === "friends" ? (
        friends.length === 0 ? (
          // Mockup empty state with CTA back to search
          <div className="py-8 text-center">
            <div className="text-4xl opacity-70">⚽</div>
            <h4 className="mt-2 font-heading text-base font-semibold">
              {t("friends.emptyTitle")}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">{t("friends.emptyDesc")}</p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                setTab("friends")
                searchRef.current?.focus()
              }}
            >
              {t("friends.findPlayers")}
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <SectionDivider legend={`${t("friends.online")} · ${online.length}`} dot="online" />
            {online.length === 0 ? (
              <p className="px-1 pb-2 text-xs text-muted-foreground">
                {t("friends.emptyOnline")}
              </p>
            ) : (
              online.map((f) => (
                <PlayerRow key={f.friendshipId} row={f}>
                  <Button
                    size="xs"
                    onClick={() => setInviteTarget({ userId: f.userId, name: f.name ?? "" })}
                    loading={pending}
                  >
                    {t("friends.invite")}
                  </Button>
                </PlayerRow>
              ))
            )}
            <SectionDivider legend={`${t("friends.offline")} · ${offline.length}`} dot="offline" />
            {offline.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                {t("friends.emptyOffline")}
              </p>
            ) : (
              offline.map((f) => (
                <PlayerRow key={f.friendshipId} row={f}>
                  <Button
                    size="xs"
                    onClick={() => setInviteTarget({ userId: f.userId, name: f.name ?? "" })}
                    loading={pending}
                  >
                    {t("friends.invite")}
                  </Button>
                </PlayerRow>
              ))
            )}
          </div>
        )
      ) : null}

      {tab === "requests" ? (
        requests.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-4xl opacity-70">📭</div>
            <h4 className="mt-2 font-heading text-base font-semibold">
              {t("friends.emptyRequests")}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("friends.emptyRequestsDesc")}
            </p>
          </div>
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
                <Button size="xs" onClick={() => respond(r.friendshipId, true)} loading={pending}>
                  {t("friends.accept")}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={t("friends.decline")}
                  onClick={() => respond(r.friendshipId, false)}
                  loading={pending}
                >
                  <XIcon className="size-3.5" aria-hidden />
                </Button>
              </PlayerRow>
            ))}
          </ul>
        )
      ) : null}

      {tab === "sent" ? (
        sent.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-4xl opacity-70">📤</div>
            <h4 className="mt-2 font-heading text-base font-semibold">
              {t("friends.emptySent")}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">{t("friends.emptySentDesc")}</p>
          </div>
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
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => cancelSent(r.friendshipId)}
                  loading={pending}
                >
                  {t("friends.cancelRequest")}
                </Button>
              </PlayerRow>
            ))}
          </ul>
        )
      ) : null}

      <InviteToMatchDialog
        key={inviteTarget?.userId ?? "none"}
        target={inviteTarget}
        onClose={() => setInviteTarget(null)}
      />
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        <span
          aria-hidden
          className={`size-2 rounded-full ${
            dot === "online" ? "bg-green-500" : "bg-muted-foreground/40"
          }`}
        />
        {legend}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
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
        <span className="truncate text-sm font-bold">{row.name ?? ""}</span>
        {row.username ? (
          <span className="truncate text-xs font-semibold text-muted-foreground">
            @{row.username}
          </span>
        ) : null}
      </span>
      {subtitle ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
      ) : (
        <span className="mt-0.5 flex items-center gap-2">
          {row.playerId ? (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
              {row.playerId}
            </span>
          ) : null}
          {row.position ? (
            <span className="text-[11px] font-bold text-muted-foreground">
              {row.position}
            </span>
          ) : null}
        </span>
      )}
    </>
  )

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50">
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
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card ${
              online ? "bg-green-500" : "bg-muted-foreground/40"
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
