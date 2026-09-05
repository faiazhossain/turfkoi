import { redirect } from "next/navigation"

import { getPlayerProfile } from "@/features/player/queries"
import {
  listFriendCandidates,
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
export default async function FriendsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  if (!session?.user) redirect("/login")
  const { tab } = await searchParams

  const profile = await getPlayerProfile(session.user.id)
  const [t, friends, requests, sent, suggestions] = await Promise.all([
    getT(),
    listFriends(session.user.id),
    listPendingFriendRequests(session.user.id),
    listSentFriendRequests(session.user.id),
    listFriendCandidates(session.user.id, {
      limit: 10,
      origin: profile?.coords ?? null,
    }),
  ])

  return (
    // friends.html styling on the app-wide dt backdrop (phase 2 chrome).
    <div className="min-h-dvh bg-dt-bg text-dt-txt">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <header>
          <h1 className="font-heading text-2xl font-bold">{t("friends.title")}</h1>
          <p className="text-sm text-dt-dim">{t("players.searchTitle")}</p>
        </header>
        <FriendsPage
          myPlayerId={profile?.playerId ?? null}
          friends={friends}
          requests={requests}
          sent={sent}
          suggestions={suggestions}
          friendIds={friends.map((f) => f.userId)}
          initialTab={
            tab === "requests" ? "requests" : tab === "sent" ? "sent" : "friends"
          }
        />
      </div>
    </div>
  )
}

export const dynamic = "force-dynamic"
