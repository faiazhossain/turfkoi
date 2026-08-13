import "server-only"

import { logger } from "./logger"

/**
 * J1 — backend perf targets. Wraps an async operation, measures wall time, and:
 *   1. Emits a structured `perf` log line with `{ route, ms, ok }`.
 *   2. (When `responder` is supplied) appends a `Server-Timing` header so the
 *      value is visible in the browser devtools Network tab.
 *
 * Used on the audit's three hot paths: slot hold (< 800ms), payment initiation
 * (< 800ms), and webhook end-to-end (< 5s). See docs/PERFORMANCE.md.
 */
export async function withTiming<T>(
  route: string,
  fn: () => Promise<T>,
  responder?: { headers: Headers }
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - start
    logger.info("perf", { route, ms, ok: true })
    if (responder) {
      responder.headers.set("Server-Timing", `${route};dur=${ms}`)
    }
    return result
  } catch (err) {
    const ms = Date.now() - start
    logger.warn("perf", { route, ms, ok: false, err: String(err) })
    if (responder) {
      responder.headers.set("Server-Timing", `${route};dur=${ms}`)
    }
    throw err
  }
}
