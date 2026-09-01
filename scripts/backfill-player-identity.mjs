// Player Network backfill (run once after the identity schema change):
//  1. Applies the additive DDL (columns, indexes, user_blocks) idempotently —
//     db:push cannot run non-interactively in this shell (see memory/
//     project_db_workflow), so DDL goes straight to Neon.
//  2. Fills player_id (DT-XXXXXX) + username for every legacy profile.
//  Columns intentionally stay NULLable: ensureProfileAndRole inserts the
//  profile before the identity fill and neon-http has no transactions.
//
// Usage: node --env-file=.env scripts/backfill-player-identity.mjs
import { neon } from "@neondatabase/serverless"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const client = neon(url)

// Same alphabet as src/features/player/identity.ts (no 0/O/1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const rand = () => Math.random()
const generatePlayerId = () =>
  "DT-" +
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("")
const suggestUsername = (name) => {
  const base =
    (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "player"
  return `${base}${Math.floor(rand() * 9000) + 1000}`.slice(0, 20)
}

async function applyDdl() {
  const hasColumn = async (name) => {
    const rows = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'player_profiles' AND column_name = $1`,
      [name]
    )
    return rows.length > 0
  }
  if (!(await hasColumn("player_id"))) {
    await client.query(`ALTER TABLE player_profiles ADD COLUMN player_id text`)
    console.log("DDL: added player_profiles.player_id")
  }
  if (!(await hasColumn("username"))) {
    await client.query(`ALTER TABLE player_profiles ADD COLUMN username text`)
    console.log("DDL: added player_profiles.username")
  }
  if (!(await hasColumn("last_seen_at"))) {
    await client.query(
      `ALTER TABLE player_profiles ADD COLUMN last_seen_at timestamptz`
    )
    console.log("DDL: added player_profiles.last_seen_at")
  }
  for (const [idx, col] of [
    ["player_profiles_player_id_idx", "player_id"],
    ["player_profiles_username_idx", "username"],
  ]) {
    const exists = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [idx])
    if (exists.length === 0) {
      await client.query(
        `CREATE UNIQUE INDEX ${idx} ON player_profiles USING btree (${col})`
      )
      console.log(`DDL: created index ${idx}`)
    }
  }
  const blocksTable = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'user_blocks'`
  )
  if (blocksTable.length === 0) {
    await client.query(`
      CREATE TABLE user_blocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now() NOT NULL
      )
    `)
    await client.query(
      `ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_blocker_id_users_id_fk FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE`
    )
    await client.query(
      `ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_blocked_id_users_id_fk FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE`
    )
    await client.query(
      `CREATE UNIQUE INDEX user_blocks_pair_idx ON user_blocks USING btree (blocker_id, blocked_id)`
    )
    await client.query(
      `CREATE INDEX user_blocks_blocked_idx ON user_blocks USING btree (blocked_id)`
    )
    console.log("DDL: created user_blocks")
  }
}

async function backfill() {
  const pending = await client.query(
    `SELECT p.user_id, u.name, p.player_id, p.username
     FROM player_profiles p JOIN users u ON u.id = p.user_id
     WHERE p.player_id IS NULL OR p.username IS NULL`
  )
  console.log(`Backfilling identity for ${pending.length} profiles…`)
  let done = 0
  for (const row of pending) {
    if (!row.player_id) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await client.query(
            `UPDATE player_profiles SET player_id = $1 WHERE user_id = $2 AND player_id IS NULL`,
            [generatePlayerId(), row.user_id]
          )
          break
        } catch (err) {
          if (err.code !== "23505") throw err
        }
      }
    }
    if (!row.username) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await client.query(
            `UPDATE player_profiles SET username = $1 WHERE user_id = $2 AND username IS NULL`,
            [suggestUsername(row.name), row.user_id]
          )
          break
        } catch (err) {
          if (err.code !== "23505") throw err
        }
      }
    }
    done++
    if (done % 100 === 0) console.log(`  ${done}/${pending.length}`)
  }
  const remaining = await client.query(
    `SELECT count(*)::int AS n FROM player_profiles WHERE player_id IS NULL OR username IS NULL`
  )
  console.log(`Backfill complete. Profiles still missing identity: ${remaining[0].n}`)
}

await applyDdl()
await backfill()
