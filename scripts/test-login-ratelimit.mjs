// Throwaway probe: verifies the login rate-limit behaves as documented
// (identifier: 11th attempt in 5 min blocked; IP: 21st). Mirrors
// src/lib/ratelimit.ts config exactly, but with unique keys so it never
// touches real counters. Run: node --env-file=.env scripts/test-login-ratelimit.mjs
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

function limiter(limit, windowSeconds) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(limit, `${windowSeconds}s`),
    prefix: "deshiturf",
    analytics: false,
  })
}

const stamp = Date.now()

async function probe(name, key, limit, windowSeconds, attempts) {
  const rl = limiter(limit, windowSeconds)
  const results = []
  for (let i = 1; i <= attempts; i++) {
    const { success } = await rl.limit(key)
    results.push(success ? "ALLOW" : "BLOCK")
  }
  const blockedFrom = results.indexOf("BLOCK") + 1 // 0 = never blocked
  console.log(`\n[${name}] key=${key}`)
  console.log(results.map((r, i) => `  #${i + 1}: ${r}`).join("\n"))
  console.log(
    blockedFrom === 0
      ? "  RESULT: FAIL - nothing was blocked"
      : blockedFrom === limit + 1
        ? `  RESULT: PASS - attempts 1-${limit} allowed, blocked from #${blockedFrom}`
        : `  RESULT: FAIL - first block at #${blockedFrom}, expected #${limit + 1}`
  )
}

await probe("identifier", `login:rl-probe-${stamp}`, 10, 300, 12)
await probe("ip", `login-ip:rl-probe-${stamp}`, 20, 300, 22)

// cleanup probe counters (fixedWindow stores under <prefix>:<seq>:<key>)
const prefix = "deshiturf"
const stamp2 = stamp
for (const key of [`login:rl-probe-${stamp2}`, `login-ip:rl-probe-${stamp2}`]) {
  let cursor = 0
  do {
    const [next, keys] = await redis.scan(cursor, { match: `*${key}*`, count: 100 })
    cursor = Number(next)
    if (keys.length) await redis.del(...keys)
  } while (cursor !== 0)
}
console.log("\nprobe counters cleaned up")
