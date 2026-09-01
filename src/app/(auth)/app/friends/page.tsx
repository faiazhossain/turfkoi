import { redirect } from "next/navigation"

import { getPlayerProfile } from "@/features/player/queries"
import {
  listFriends,
  listPendingFriendRequests,
  listSentFriendRequests,
} from "@/features/friends/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { getSession } from "@/lib/auth"
import { FriendsPage } from "@/components/friends/friends-page"

export async function generateMetadata() {
  return buildMetadata({ titleKey: "friends.title" })
}

/**
 * Player Network hub (/friends): friends, requests, sent invites — plus
 * identity search and per-friend match invites. Server page fetches the
 * lists once; the client component handles tabs + actions.
 */
export default async function FriendsHubPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const [t, profile, friends, requests, sent] = await Promise.all([
    getT(),
    getPlayerProfile(session.user.id),
    listFriends(session.user.id),
    listPendingFriendRequests(session.user.id),
    listSentFriendRequests(session.user.id),
  ])

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold">{t("friends.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("players.searchTitle")}</p>
      </header>
      <FriendsPage
        myPlayerId={profile?.playerId ?? null}
        friends={friends}
        requests={requests}
        sent={sent}
        friendIds={friends.map((f) => f.userId)}
      />
    </div>
  )
}

export const dynamic = "force-dynamic"
