import { notFound } from "next/navigation"
import Link from "next/link"

import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { getSession } from "@/lib/auth"
import { isPresenceOnline } from "@/lib/presence"
import { positionLabelKey, skillLabelKey } from "@/i18n/labels"
import { getPlayerByCode } from "@/features/player/queries"
import {
  getFriendshipState,
  getBlockDirection,
  getFriendshipIdBetween,
} from "@/features/friends/queries"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import { QrShare } from "@/components/players/qr-share"
import { ProfileActions } from "@/components/players/profile-actions"
import { Button } from "@/components/ui/button"

export async function generateMetadata() {
  return buildMetadata({ titleKey: "metadata.playerProfileTitle" })
}

/**
 * Public player profile (Player Network): resolved by the permanent
 * DeshiTurf ID — the internal uuid never appears in the URL. Signed-out
 * visitors see a limited card; signed-in players get Add Friend / Invite /
 * Block. Blocked pairs only see that interaction is off.
 */
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const [player, t] = await Promise.all([getPlayerByCode(code), getT()])
  if (!player) notFound()

  const session = await getSession()
  const viewerId = session?.user?.id
  const isSelf = viewerId === player.userId

  let relation: Awaited<ReturnType<typeof getFriendshipState>> = "none"
  let blockDir: "byViewer" | "onViewer" | null = null
  let friendshipId: string | null = null
  if (viewerId && !isSelf) {
    ;[relation, blockDir, friendshipId] = await Promise.all([
      getFriendshipState(viewerId, player.userId),
      getBlockDirection(viewerId, player.userId),
      getFriendshipIdBetween(viewerId, player.userId),
    ])
  }

  const online = isPresenceOnline(player.lastSeenAt)
  const positionKey = positionLabelKey(player.position)
  const skillKey = skillLabelKey(player.skill)

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8">
      <section className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="relative mx-auto w-fit">
          <PlayerAvatar
            display={resolveAvatarDisplay({
              avatarType: player.avatarType,
              avatarPublicId: player.avatarPublicId,
              avatarPresetId: player.avatarPresetId,
              name: player.name,
            })}
            size="xl"
          />
          <span
            aria-hidden
            title={online ? t("friends.online") : t("friends.offline")}
            className={`absolute bottom-0 right-0 size-4 rounded-full border-2 border-card ${
              online ? "bg-green-500" : "bg-muted-foreground/40"
            }`}
          />
        </div>

        <h1 className="mt-3 font-heading text-xl font-semibold">{player.name}</h1>
        {player.username ? (
          <p className="text-sm text-muted-foreground">@{player.username}</p>
        ) : null}

        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-accent px-3 py-1.5">
          <span className="font-mono text-sm font-semibold tracking-wide">
            {player.playerId}
          </span>
        </div>
        <div className="mt-3 flex justify-center">
          <QrShare playerId={player.playerId ?? code} playerName={player.name ?? ""} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          {positionKey ? (
            <span className="rounded-full border border-border px-3 py-1 font-semibold text-foreground">
              {t(positionKey)}
            </span>
          ) : null}
          {skillKey ? (
            <span className="rounded-full border border-border px-3 py-1">
              {t(skillKey)}
            </span>
          ) : null}
          {player.area ? <span className="rounded-full border border-border px-3 py-1">{player.area}</span> : null}
        </div>
      </section>

      {!viewerId ? (
        <section className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("players.signInToConnect")}</p>
          <Button render={<Link href="/login" />} size="sm" className="mt-3">
            {t("nav.signIn")}
          </Button>
        </section>
      ) : isSelf ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("players.playerIdPermanent")}
        </p>
      ) : relation === "blocked" ? (
        <section className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {blockDir === "byViewer" ? t("players.blockedNotice") : t("players.blockedByNotice")}
          </p>
        </section>
      ) : (
        <ProfileActions
          targetUserId={player.userId}
          targetName={player.name ?? ""}
          relation={relation}
          friendshipId={friendshipId}
          blockedByViewer={blockDir === "byViewer"}
        />
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
