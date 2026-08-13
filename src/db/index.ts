import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"

import * as schema from "./schema"

export type DB = NeonHttpDatabase<typeof schema>

let _db: DB | undefined

function resolveDb(): DB {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon pooled connection string to .env."
    )
  }
  _db = drizzle({ client: neon(url), schema })
  return _db
}

/**
 * Lazy DB client. `neon()` throws on an empty connection string, so construction
 * is deferred to the first query. This keeps `next build` (which evaluates the
 * module graph) working without DATABASE_URL set, and fails clearly at runtime
 * instead. Methods are bound so chaining (`db.select().from(...)`) keeps `this`.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const target = resolveDb()
    const value = Reflect.get(target, prop)
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value
  },
}) as DB

export { schema }
