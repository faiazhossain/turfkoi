import Pusher from "pusher"

import "server-only"

let _pusher: Pusher | null = null

function getPusher(): Pusher {
  if (_pusher) return _pusher
  _pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID ?? "",
    key: process.env.NEXT_PUBLIC_PUSHER_KEY ?? "",
    secret: process.env.PUSHER_SECRET ?? "",
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap1",
    useTLS: true,
  })
  return _pusher
}

/**
 * Publish a server-side event (audit G4: Pusher). Vercel serverless can't hold
 * WebSockets, so the server publishes on state transitions and clients
 * subscribe. No-op without keys (dev).
 */
export async function publish(
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  if (!process.env.PUSHER_APP_ID) return
  await getPusher().trigger(channel, event, data)
}
