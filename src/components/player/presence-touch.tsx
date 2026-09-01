import { getSession } from "@/lib/auth"
import { touchPresence } from "@/features/player/presence"

/**
 * Presence beacon (Player Network): every signed-in visit to an /app page
 * refreshes the player's lastSeenAt (throttled server-side to one write per
 * ~4 minutes), which powers the friends hub's Online/Offline grouping.
 */
export async function PresenceTouch() {
  const session = await getSession()
  if (session?.user) {
    await touchPresence(session.user.id).catch(() => {
      /* presence is best-effort */
    })
  }
  return null
}
