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
    // friends.html styling, but the backdrop stays on the project's
    // --background (#080B10) instead of the mockup's #0b1220.
    <div className="min-h-dvh bg-background text-[#e8eef7]">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <header>
          <h1 className="font-heading text-2xl font-bold">{t("friends.title")}</h1>
          <p className="text-sm text-[#93a4bf]">{t("players.searchTitle")}</p>
        </header>
        <FriendsPage
          myPlayerId={profile?.playerId ?? null}
          friends={friends}
          requests={requests}
          sent={sent}
          friendIds={friends.map((f) => f.userId)}
        />
      </div>
    </div>
  )
}

export const dynamic = "force-dynamic"
