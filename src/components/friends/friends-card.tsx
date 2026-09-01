"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import {
  sendFriendRequestAction,
  respondToFriendRequestAction,
  removeFriendAction,
  searchUsersForFriendAction,
} from "@/features/friends/actions"
import type { FriendRow, PendingRequestRow } from "@/features/friends/queries"

interface SearchHit {
  id: string
  name: string | null
  phone: string
}

/**
 * Friends hub on the player dashboard: friends list, received requests with
 * accept/decline, and a name/phone search that offers "add friend".
 */
export function FriendsCard({
  friends,
  requests,
  friendIds,
}: {
  friends: FriendRow[]
  requests: PendingRequestRow[]
  /** Ids already befriended — used to hide stale search hits. */
  friendIds: string[]
}) {
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [term, setTerm] = useState("")
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  function search() {
    start(async () => {
      const rows = await searchUsersForFriendAction(term)
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
      setHits((prev) => (prev ?? []).filter((h) => h.id !== userId))
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

  const visibleHits = (hits ?? []).filter((h) => !friendIds.includes(h.id))

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">{t("friends.title")}</h2>
        <a
          href="/app/friends"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("friends.viewAll")}
        </a>
      </div>

      {/* Received requests */}
      {requests.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">{t("friends.requestsTitle")}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {requests.map((r) => (
              <li key={r.friendshipId} className="flex items-center gap-3 bg-card p-2.5 text-sm">
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
                <Button size="xs" onClick={() => respond(r.friendshipId, true)} loading={pending}>
                  {t("friends.accept")}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => respond(r.friendshipId, false)}
                  loading={pending}
                >
                  {t("friends.decline")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Search */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("friends.searchPlaceholder")}
          className="w-48"
          maxLength={50}
        />
        <Button size="sm" variant="outline" onClick={search} loading={pending} disabled={term.trim().length < 2}>
          {t("friends.search")}
        </Button>
      </div>
      {visibleHits.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {visibleHits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{h.name ?? h.phone}</span>
              <Button size="xs" variant="outline" onClick={() => request(h.id)} loading={pending}>
                {t("friends.addFriend")}
              </Button>
            </li>
          ))}
        </ul>
      ) : hits !== null && visibleHits.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("friends.searchEmpty")}</p>
      ) : null}

      {/* Friends list */}
      <div className="mt-4">
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("friends.empty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {friends.map((f) => (
              <li key={f.friendshipId} className="flex items-center gap-3 bg-card p-2.5 text-sm">
                <PlayerAvatar
                  display={resolveAvatarDisplay({
                    avatarType: f.avatarType,
                    avatarPublicId: f.avatarPublicId,
                    avatarPresetId: f.avatarPresetId,
                    name: f.name,
                  })}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">{f.name ?? f.phone}</span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => remove(f.friendshipId)}
                  loading={pending}
                >
                  {t("friends.remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
