"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { MapPinIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import {
  sendFriendRequestAction,
  respondToFriendRequestAction,
  removeFriendAction,
} from "@/features/friends/actions"
import { searchPlayersAction } from "@/features/player/actions"
import type { FriendRow, PendingRequestRow } from "@/features/friends/queries"
import type { PlayerCardRow } from "@/features/player/queries"

/**
 * Friends hub on the player dashboard: friends list, received requests with
 * accept/decline, and the shared identity search (DT-ID / @username / name)
 * that offers "add friend". Same search as the /app/friends hub — hits show
 * DT-ID + @username + area so same-name players are tellable.
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
  const [hits, setHits] = useState<PlayerCardRow[] | null>(null)

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

  const visibleHits = (hits ?? []).filter((h) => !friendIds.includes(h.userId))

  return (
    <section className="rounded-lg border border-dt-line bg-dt-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">{t("friends.title")}</h2>
        <a
          href="/app/friends"
          className="text-sm font-medium text-dt-green hover:underline"
        >
          {t("friends.viewAll")}
        </a>
      </div>

      {/* Received requests */}
      {requests.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">{t("friends.requestsTitle")}</p>
          <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
            {requests.map((r) => (
              <li
                key={r.friendshipId}
                className="flex items-center gap-3 p-2.5 text-sm odd:bg-dt-card even:bg-dt-card2"
              >
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
            <li key={h.userId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {h.name}
                  {h.username ? (
                    <span className="ml-1.5 text-xs font-semibold text-dt-dim">
                      @{h.username}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-dt-dim">
                  {h.playerId ? (
                    <span className="rounded bg-dt-blue/10 px-1.5 py-0.5 font-mono font-semibold text-dt-blue">
                      {h.playerId}
                    </span>
                  ) : null}
                  {h.area ? (
                    <span className="flex min-w-0 items-center gap-0.5">
                      <MapPinIcon className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{h.area}</span>
                    </span>
                  ) : null}
                </span>
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => request(h.userId)}
                loading={pending}
              >
                {t("friends.addFriend")}
              </Button>
            </li>
          ))}
        </ul>
      ) : hits !== null && visibleHits.length === 0 ? (
        <p className="mt-2 text-xs text-dt-dim">{t("friends.searchEmpty")}</p>
      ) : null}

      {/* Friends list */}
      <div className="mt-4">
        {friends.length === 0 ? (
          <p className="text-sm text-dt-dim">{t("friends.empty")}</p>
        ) : (
          <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
            {friends.map((f) => (
              <li
                key={f.friendshipId}
                className="flex items-center gap-3 p-2.5 text-sm odd:bg-dt-card even:bg-dt-card2"
              >
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
