import { notFound, redirect } from "next/navigation"

import { getMatchIdByShareToken } from "@/features/matches/queries"

/**
 * Shareable match invite link (deshiturf.com/m/<token>). Resolves the short
 * token to the match room; signed-out visitors are redirected through login/
 * register by the proxy's match-link cookie (see proxy.ts / homeForUser), so
 * post-auth they land straight back here → the match.
 */
export default async function MatchSharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const matchId = await getMatchIdByShareToken(token)
  if (!matchId) notFound()
  redirect(`/matches/${matchId}`)
}

export const dynamic = "force-dynamic"
