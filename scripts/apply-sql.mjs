// Apply a SQL file directly to the dev Neon database (project workflow:
// db:push cannot run non-interactively; see memory/project_db_workflow).
// Usage: node scripts/apply-sql.mjs drizzle/0015_erp_foundation.sql
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const file = process.argv[2]
if (!file) {
  console.error("Usage: node scripts/apply-sql.mjs <file.sql>")
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const sql = readFileSync(file, "utf8")
const client = neon(url)
try {
  // Split on semicolons at line ends — this file has no functions or strings
  // containing ';'. Neon's HTTP endpoint runs the batch as one transaction.
  const statements = ["BEGIN"]
    .concat(
      sql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
    .concat(["COMMIT"])
  for (const statement of statements) {
    await client.query(statement)
  }
  console.log(`Applied ${file} (${statements.length - 2} statements)`)
} catch (err) {
  await client.query("ROLLBACK").catch(() => {})
  console.error("Failed:", err.message)
  process.exit(1)
}
