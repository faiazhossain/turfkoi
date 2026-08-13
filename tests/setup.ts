/**
 * Vitest global setup. We don't auto-reset the DB — each test opts in to a
 * unique fixture id so concurrent runs don't collide. The setup just makes
 * sure DATABASE_URL is set; otherwise tests skip themselves.
 */
import { beforeAll } from "vitest"

export function hasTestDb(): boolean {
  return !!process.env.DATABASE_URL
}

beforeAll(() => {
  if (!hasTestDb()) {
    // Vitest will surface per-test `skip()` messages; no global fatal here.
  }
})
