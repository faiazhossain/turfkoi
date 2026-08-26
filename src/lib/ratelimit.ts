import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

import "server-only"

let _redis: Redis | null = null

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  if (!_redis) _redis = new Redis({ url, token })
  return _redis
}

const _limiters = new Map<string, Ratelimit>()

/**
 * Fixed-window rate limit (audit G5). Shared store is required on serverless -
 * in-memory limits do not work across Vercel instances. Returns true when
 * allowed (or when Upstash is unconfigured, i.e. dev without keys).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const r = redis()
  if (!r) return true // dev: no Redis -> allow
  const cacheKey = `fw:${limit}:${windowSeconds}`
  let rl = _limiters.get(cacheKey)
  if (!rl) {
    rl = new Ratelimit({
      redis: r,
      limiter: Ratelimit.fixedWindow(limit, `${windowSeconds}s`),
      prefix: "deshiturf",
      analytics: true,
    })
    _limiters.set(cacheKey, rl)
  }
  const { success } = await rl.limit(key)
  return success
}

let _generic: Ratelimit | null = null

/** Generic sliding-window limiter (60/min) for ad-hoc endpoints. */
export function getRatelimit(): Ratelimit | null {
  const r = redis()
  if (!r) return null
  if (!_generic) {
    _generic = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "deshiturf:gen",
      analytics: true,
    })
  }
  return _generic
}
