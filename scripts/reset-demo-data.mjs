// Remove every demo row created by seed-demo-players.mjs +
// seed-demo-accounts.mjs, restoring the pre-seed state:
//   - demo accounts (players, turf owners, team owners) and everything that
//     cascades from them (roles, profiles, team memberships, friendships,
//     ERP data, roster invitations)
//   - demo teams + rosters + the pending team invitation
//   - schedules/sections and materialized slots on the three demo turfs
//   - demo turf ownership (owner_id back to NULL = admin-seeded, unclaimed)
//
// The turfs themselves are KEPT (they predate the demo seed); delete them
// by hand if you want them gone too. Real accounts (e.g. the personal
// +8801521425927 / +8801310899049 users, admin, Foysal) are untouched —
// every deletion is scoped to the demo uuid prefix or the demo turf slugs.
//
// Dry-run by default. Pass --yes to execute.
// Usage: node --env-file=.env scripts/reset-demo-data.mjs [--yes]
import { neon } from "@neondatabase/serverless"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const DEMO_TURF_SLUGS = ["demo-uttara-fives", "demo-dhanmondi-arena", "demo-gulshan-turf-7s"]

async function main() {
  const db = neon(process.env.DATABASE_URL)
  const execute = process.argv.includes("--yes")

  // Read-only counts for the report. All demo users share the d5 uuid
  // prefix (both seed scripts use fixed d5 ids).
  const [{ n: userCount }] = await db`
    SELECT count(*)::int AS n FROM users WHERE id::text LIKE 'd5000000-%'`
  const [{ n: teamCount }] = await db`
    SELECT count(*)::int AS n FROM teams WHERE id::text LIKE 'd5000000-%'`
  const [{ n: ownedCount }] = await db`
    SELECT count(*)::int AS n FROM turfs WHERE owner_id::text LIKE 'd5000000-%'`
  const [{ n: scheduleCount }] = await db`
    SELECT count(*)::int AS n FROM turf_schedules
    WHERE turf_id IN (
      SELECT id FROM turfs
      WHERE slug = ${DEMO_TURF_SLUGS[0]}
         OR slug = ${DEMO_TURF_SLUGS[1]}
         OR slug = ${DEMO_TURF_SLUGS[2]}
    )`
  const [{ n: slotCount }] = await db`
    SELECT count(*)::int AS n FROM turf_slots
    WHERE turf_id IN (
      SELECT id FROM turfs
      WHERE slug = ${DEMO_TURF_SLUGS[0]}
         OR slug = ${DEMO_TURF_SLUGS[1]}
         OR slug = ${DEMO_TURF_SLUGS[2]}
    )`

  console.log(`Demo data currently in the database:
  users:        ${userCount}
  teams:        ${teamCount}
  owned turfs:  ${ownedCount}
  schedules:    ${scheduleCount}
  slots:        ${slotCount}`)

  if (!execute) {
    console.log("\nDry run — nothing changed. Re-run with --yes to delete.")
    return
  }

  // 1. Turfs first: owner_id is ON DELETE RESTRICT, so the demo owners
  //    cannot be deleted while turfs still point at them. NULL puts a turf
  //    back in its admin-seeded, awaiting-claim state.
  const turfs = await db`
    UPDATE turfs SET owner_id = NULL, updated_at = now()
    WHERE owner_id::text LIKE 'd5000000-%'
    RETURNING slug`
  console.log(`Turfs released to unclaimed: ${turfs.map((t) => t.slug).join(", ") || "none"}`)

  // 2. Schedules (cascades sections) + slots on the demo turfs — including
  //    anything the app materialized or the owner hand-added while testing.
  const schedules = await db`
    DELETE FROM turf_schedules
    WHERE turf_id IN (
      SELECT id FROM turfs
      WHERE slug = ${DEMO_TURF_SLUGS[0]}
         OR slug = ${DEMO_TURF_SLUGS[1]}
         OR slug = ${DEMO_TURF_SLUGS[2]}
    )
    RETURNING id`
  console.log(`Schedules removed: ${schedules.length}`)

  const slots = await db`
    DELETE FROM turf_slots
    WHERE turf_id IN (
      SELECT id FROM turfs
      WHERE slug = ${DEMO_TURF_SLUGS[0]}
         OR slug = ${DEMO_TURF_SLUGS[1]}
         OR slug = ${DEMO_TURF_SLUGS[2]}
    )
    RETURNING turf_id`
  console.log(`Slots removed: ${slots.length}`)

  // 3. Teams (cascades team_members + team_invitations).
  const teams = await db`
    DELETE FROM teams WHERE id::text LIKE 'd5000000-%' RETURNING name`
  console.log(`Teams removed: ${teams.map((t) => t.name).join(", ") || "none"}`)

  // 4. Users last (cascades roles, profiles, memberships, friendships,
  //    ERP rows, invitations invited_by).
  const users = await db`
    DELETE FROM users WHERE id::text LIKE 'd5000000-%' RETURNING name`
  console.log(`Users removed: ${users.length}`)

  console.log("\nDone. Re-seed any time with db:seed:players + db:seed:accounts.")
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
