import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

import "server-only"

let _ratelimit: Ratelimit | null = null

/**
 * Shared rate limiter backed by Upstash Redis (audit G5). Required on
 * serverless - in-memory limits don't work across Vercel instances. Returns
 * null when unconfigured so dev runs without keys.
 */
export function getRatelimit(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  if (_ratelimit) return _ratelimit
  _ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    // Default window; per-route overrides (auth/payment tighter) in Phase 1/3.
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: true,
    prefix: "turfkoi:rl",
  })
  return _ratelimit
}
