"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, SearchIcon, UsersIcon } from "lucide-react"

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
 * Player Network hub (/friends): identity search (DeshiTurf ID / @username /
 * name), friends grouped Online/Offline with match invites, incoming and
 * sent requests. Mirrors the approved friends-hub mockup: pills tabs, player
 * cards, quick actions.
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
  const [tab, setTab] = useState<Tab>("friends")
  const [pending, start] = useTransition()
  const [term, setTerm] = useState("")
  const [hits, setHits] = useState<PlayerCardRow[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteTarget, setInviteTarget] = useState<{ userId: string; name: string } | null>(
    null
  )

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

  function remove(friendshipId: string) {
    start(async () => {
      const res = await removeFriendAction({ friendshipId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.removedToast"))
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

  const visibleHits = (hits ?? []).filter((h) => !friendIds.includes(h.userId))

  return (
    <div className="space-y-4">
      {/* Your Player ID — the shareable handle */}
      {myPlayerId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("players.playerIdLabel")}</p>
            <p className="font-mono text-sm font-semibold tracking-wide">{myPlayerId}</p>
          </div>
          <Button size="sm" variant="outline" onClick={copyId}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? t("players.copied") : t("players.copyId")}
          </Button>
        </div>
      )}

      {/* Player search (primary: DeshiTurf ID, then @username / name) */}
      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search()
          }}
          placeholder={t("players.searchPlaceholder")}
          className="min-w-48 flex-1"
          maxLength={50}
        />
        <Button size="sm" variant="outline" onClick={search} loading={pending} disabled={term.trim().length < 2}>
          <SearchIcon data-icon="inline-start" />
          {t("friends.search")}
        </Button>
      </div>
      {term.trim().length >= 2 && hits !== null ? (
        visibleHits.length > 0 ? (
          <ul className="space-y-2">
            {visibleHits.map((h) => (
              <li
                key={h.userId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-sm"
              >
                <PlayerAvatar
                  display={resolveAvatarDisplay({
                    avatarType: h.avatarType,
                    avatarPublicId: h.avatarPublicId,
                    avatarPresetId: h.avatarPresetId,
                    name: h.name,
                  })}
                  size="sm"
                />
                <Link href={`/players/${h.playerId}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {h.username ? `@${h.username}` : ""}
                    {h.playerId ? ` · ${h.playerId}` : ""}
                  </span>
                </Link>
                <Button size="xs" variant="outline" onClick={() => request(h.userId)} loading={pending}>
                  {t("friends.addFriend")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t("players.searchEmptyTitle")}</p>
        )
      ) : hits !== null && term.trim().length >= 2 ? (
        <p className="text-xs text-muted-foreground">{t("players.searchEmptyDesc")}</p>
      ) : null}

      {/* Pills tabs */}
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {(
          [
            ["friends", t("friends.tabFriends"), friends.length],
            ["requests", t("friends.tabRequests"), requests.length],
            ["sent", t("friends.tabSent"), sent.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {tab === "friends" ? (
        friends.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <UsersIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-heading text-base font-medium">{t("friends.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("friends.emptyDesc")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <FriendGroup
              label={`${t("friends.online")} · ${online.length}`}
              rows={online}
              onInvite={(f) => setInviteTarget({ userId: f.userId, name: f.name ?? "" })}
              onRemove={remove}
              pending={pending}
            />
            <FriendGroup
              label={`${t("friends.offline")} · ${offline.length}`}
              rows={offline}
              onInvite={(f) => setInviteTarget({ userId: f.userId, name: f.name ?? "" })}
              onRemove={remove}
              pending={pending}
            />
          </div>
        )
      ) : null}

      {tab === "requests" ? (
        requests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("friends.emptyRequests")}
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.friendshipId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-sm">
                <PlayerAvatar
                  display={resolveAvatarDisplay({
                    avatarType: r.avatarType,
                    avatarPublicId: r.avatarPublicId,
                    avatarPresetId: r.avatarPresetId,
                    name: r.name,
                  })}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">
                  {r.name ?? r.phone}
                  <span className="block text-xs text-muted-foreground">
                    {t("friends.incomingRequest")}
                  </span>
                </span>
                <Button size="xs" onClick={() => respond(r.friendshipId, true)} loading={pending}>
                  {t("friends.accept")}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => respond(r.friendshipId, false)} loading={pending}>
                  {t("friends.decline")}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "sent" ? (
        sent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("friends.emptySent")}
          </p>
        ) : (
          <ul className="space-y-2">
            {sent.map((r) => (
              <li key={r.friendshipId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-sm">
                <PlayerAvatar
                  display={resolveAvatarDisplay({
                    avatarType: r.avatarType,
                    avatarPublicId: r.avatarPublicId,
                    avatarPresetId: r.avatarPresetId,
                    name: r.name,
                  })}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">{r.name ?? r.phone}</span>
                <Button size="xs" variant="ghost" onClick={() => cancelSent(r.friendshipId)} loading={pending}>
                  {t("friends.cancelRequest")}
                </Button>
              </li>
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

function FriendGroup({
  label,
  rows,
  onInvite,
  onRemove,
  pending,
}: {
  label: string
  rows: FriendRow[]
  onInvite: (f: FriendRow) => void
  onRemove: (friendshipId: string) => void
  pending: boolean
}) {
  const { t } = useI18n()
  if (rows.length === 0) return null
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-2">
        {rows.map((f) => (
          <li key={f.friendshipId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-sm">
            <span className="relative">
              <PlayerAvatar
                display={resolveAvatarDisplay({
                  avatarType: f.avatarType,
                  avatarPublicId: f.avatarPublicId,
                  avatarPresetId: f.avatarPresetId,
                  name: f.name,
                })}
                size="sm"
              />
              <span
                aria-hidden
                className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${
                  isPresenceOnline(f.lastSeenAt) ? "bg-green-500" : "bg-muted-foreground/40"
                }`}
              />
            </span>
            <Link href={`/players/${f.playerId}`} className="min-w-0 flex-1">
              <span className="block truncate font-medium">{f.name ?? f.phone}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {f.position ? `${f.position} · ` : ""}
                {f.playerId ?? ""}
              </span>
            </Link>
            <Button size="xs" variant="outline" onClick={() => onInvite(f)} loading={pending}>
              {t("friends.invite")}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onRemove(f.friendshipId)} loading={pending}>
              {t("friends.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
