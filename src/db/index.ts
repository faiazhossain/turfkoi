import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

import * as schema from "./schema"

// Neon HTTP client (serverless-friendly; uses the pooled DATABASE_URL).
// Construction is safe at import; queries fail until DATABASE_URL is set.
const sql = neon(process.env.DATABASE_URL ?? "")

export const db = drizzle({ client: sql, schema })
export type DB = typeof db
export { schema }
