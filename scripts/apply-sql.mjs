// Apply a raw SQL file (e.g. a hand-written drizzle/00NN_*.sql migration) to
// the configured Neon database. Complements the seed scripts, which use the
// same connection pattern — no psql / local socket needed.
//
// Usage: node --env-file=.env scripts/apply-sql.mjs drizzle/0026_match_event_log.sql
//
// The neon-http driver executes one prepared statement per call, so the file
// is split into statements on top-level semicolons — dollar-quoted DO $$ …
// $$ bodies (which contain semicolons) are kept intact. Write migrations
// idempotent (IF NOT EXISTS / guarded DO blocks) so re-runs are safe.
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { neon } from "@neondatabase/serverless"

/** Split on top-level semicolons, respecting $$ dollar quoting, single-quoted
 * strings, and -- line comments; drop comment-only chunks (statements keep
 * their leading comments). */
export function splitStatements(text) {
  const statements = []
  let current = ""
  let inDollar = false
  let inSingleQuote = false
  let inLineComment = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inLineComment) {
      current += ch
      if (ch === "\n") inLineComment = false
      continue
    }
    if (!inSingleQuote && !inDollar && ch === "-" && next === "-") {
      inLineComment = true
      current += ch
      continue
    }
    if (!inLineComment && !inDollar && ch === "'") {
      inSingleQuote = !inSingleQuote
      current += ch
      continue
    }
    if (!inLineComment && !inSingleQuote && ch === "$" && next === "$") {
      inDollar = !inDollar
      current += "$$"
      i++
      continue
    }
    if (
      ch === ";" &&
      !inDollar &&
      !inSingleQuote &&
      !inLineComment
    ) {
      statements.push(current)
      current = ""
      continue
    }
    current += ch
  }
  statements.push(current)

  return statements
    .map((s) => s.trim())
    .filter((s) =>
      s
        .split("\n")
        .some((line) => line.trim() !== "" && !line.trim().startsWith("--"))
    )
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error("Usage: node --env-file=.env scripts/apply-sql.mjs <file.sql>")
    process.exit(1)
  }

  const connectionString =
    process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error("DATABASE_DIRECT_URL (or DATABASE_URL) is not set")
    process.exit(1)
  }

  const text = await readFile(file, "utf8")
  const sql = neon(connectionString)
  try {
    const statements = splitStatements(text)
    for (const statement of statements) {
      // .query(): raw string form (the tagged-template form is for parameters).
      await sql.query(statement)
    }
    console.log(`Applied ${file} (${statements.length} statements)`)
  } catch (error) {
    console.error(`Failed to apply ${file}:`, error.message)
    process.exit(1)
  }
}

// Only run when invoked directly — splitStatements is importable for tests.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
