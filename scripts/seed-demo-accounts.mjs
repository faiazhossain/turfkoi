// Seed the remaining demo accounts beyond the players seed so every feature
// area is testable: turf owners (with schedules, materialized slots, ERP
// data), team owners + rosters (captain flows, match wizard), a pending team
// invitation, and friendships among the demo players.
//
// Usage: node --env-file=.env scripts/seed-demo-accounts.mjs
// (or: npm run db:seed:accounts — run db:seed:players first, the rosters
// reference those players by phone.)
//
// - Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, safe to re-run.
// - Every demo account signs in with phone + DEMO_PASSWORD (dev only!).
// - The three unused admin-seeded demo turfs (demo-uttara-fives,
//   demo-dhanmondi-arena, demo-gulshan-turf-7s — zero slots/schedules) are
//   reassigned from the owner's personal account to the demo turf owners.
//   Original owner is printed on first run; see docs/demo-accounts.md.
// - Template slots for the next 21 days are materialized directly so the
//   booking flow works before the daily Inngest cron fires; sections match
//   the seeded schedules exactly, so cron reconciliation is a no-op.
import { neon } from "@neondatabase/serverless"
import bcrypt from "bcryptjs"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const DEMO_PASSWORD = "demo1234"

// Fixed UUIDv4-shaped ids (d5 = "demo" mnemonic) keep re-runs stable.
// Groups: a = turf owners, b = team owners, c = teams, d = schedules,
// e = ERP rows.
const TURF_OWNER_1 = "d5000000-0000-4000-8000-a00000000001"
const TURF_OWNER_2 = "d5000000-0000-4000-8000-a00000000002"
const TEAM_OWNER_1 = "d5000000-0000-4000-8000-b00000000001"
const TEAM_OWNER_2 = "d5000000-0000-4000-8000-b00000000002"
const TEAM_1 = "d5000000-0000-4000-8000-c00000000001"
const TEAM_2 = "d5000000-0000-4000-8000-c00000000002"
const SCHEDULE_UTTARA = "d5000000-0000-4000-8000-d00000000001"
const SCHEDULE_GULSHAN = "d5000000-0000-4000-8000-d00000000002"
const SCHEDULE_DHANMONDI = "d5000000-0000-4000-8000-d00000000003"
// Final group is 8 chars so the 4-char suffixes below form valid uuids.
const ERP_PREFIX = "d5000000-0000-4000-8000-e0000000"
// Build the full id in JS: interpolating ERP_PREFIX and typing the suffix
// beside it in a tagged template would leave the suffix as raw SQL text
// after the $n placeholder instead of concatenating into the bound value.
const erp = (suffix) => ERP_PREFIX + suffix

// Demo turfs already in the DB (admin-seeded, previously owned by the
// project owner's personal account +8801521425927).
const TURF_ASSIGNMENTS = [
  { slug: "demo-uttara-fives", ownerId: TURF_OWNER_1 },
  { slug: "demo-gulshan-turf-7s", ownerId: TURF_OWNER_1 },
  { slug: "demo-dhanmondi-arena", ownerId: TURF_OWNER_2 },
]

// Slot windows per turf, kept in lockstep with the seeded schedule sections
// so the daily materialization cron sees them as its own output. Hourly
// slots from section start (inclusive) to end (exclusive).
const SLOT_PLAN = {
  "demo-uttara-fives": {
    scheduleId: SCHEDULE_UTTARA,
    sections: [{ label: "সন্ধ্যা", startHour: 17, endHour: 23, price: "900" }],
  },
  "demo-gulshan-turf-7s": {
    scheduleId: SCHEDULE_GULSHAN,
    sections: [
      { label: "সকাল", startHour: 6, endHour: 9, price: "700" },
      { label: "সন্ধ্যা", startHour: 17, endHour: 23, price: "1500" },
    ],
  },
  "demo-dhanmondi-arena": {
    scheduleId: SCHEDULE_DHANMONDI,
    sections: [{ label: "সন্ধ্যা", startHour: 16, endHour: 23, price: "1200" }],
  },
}

const SLOT_DAYS_AHEAD = 20

// DT-XXXXXX player ids use the app's unambiguous alphabet
// (src/features/player/username.ts — no 0/O/1/I/L).
const PROFILES = {
  [TURF_OWNER_1]: { playerId: "DT-SHAF4Q", username: "shafiq4201" },
  [TURF_OWNER_2]: { playerId: "DT-NUSR4T", username: "nusrat8402" },
  [TEAM_OWNER_1]: { playerId: "DT-RAK8B4", username: "rakibul9301" },
  [TEAM_OWNER_2]: { playerId: "DT-SAB8R2", username: "sabbir9302" },
}

// ERP system category slugs mirror SYSTEM_CATEGORY_SLUGS in
// src/features/erp/finance.ts (labels resolve via dictionary keys).
const ERP_CATEGORY_SLUGS = [
  "rent",
  "electricity",
  "water",
  "internet",
  "staff_salary",
  "cleaning",
  "maintenance",
  "equipment",
  "marketing",
  "security",
  "other",
]
const ERP_FIXED_KIND = new Set([
  "rent",
  "electricity",
  "water",
  "internet",
  "staff_salary",
  "security",
])

// Rosters + friendships reference the players seed by phone. Index matches
// seed-demo-players.mjs order (101..114).
const PLAYER_PHONES = Array.from({ length: 14 }, (_, i) => ({
  phone: `+88016100001${String(i + 1).padStart(2, "0")}`,
}))

const TEAMS = [
  {
    id: TEAM_1,
    slug: "dhaka-thunder",
    name: "Dhaka Thunder",
    ownerId: TEAM_OWNER_1,
    pendingInvitePhone: null,
    members: [
      { phone: "+8801930000001", role: "owner" }, // Rakibul Islam
      { phone: "+8801610000103", role: "captain" }, // Mehedi Hasan
      { phone: "+8801610000102", role: "player" }, // Tanvir Ahmed
      { phone: "+8801610000104", role: "player" }, // Sakib Al Mahmud
      { phone: "+8801610000105", role: "player" }, // Naimur Rahman
      { phone: "+8801610000108", role: "player" }, // Fahim Mridha
      { phone: "+8801610000110", role: "player" }, // Imran Kabir
    ],
  },
  {
    id: TEAM_2,
    slug: "uttara-strikers",
    name: "Uttara Strikers",
    ownerId: TEAM_OWNER_2,
    // Unregistered phone: registering this number auto-joins Uttara Strikers.
    pendingInvitePhone: "+8801930000003",
    members: [
      { phone: "+8801930000002", role: "owner" }, // Sabbir Ahmed
      { phone: "+8801610000111", role: "captain" }, // Razib Chowdhury
      { phone: "+8801610000101", role: "player" }, // Rakib Hasan
      { phone: "+8801610000106", role: "player" }, // Arif Hossain
      { phone: "+8801610000107", role: "player" }, // Jibon Sheikh
      { phone: "+8801610000112", role: "player" }, // Tuhin Mia
    ],
  },
]

const FRIENDSHIPS = [
  { from: "+8801610000103", to: "+8801610000102", status: "accepted" }, // Mehedi -> Tanvir
  { from: "+8801610000104", to: "+8801610000103", status: "accepted" }, // Sakib -> Mehedi
  { from: "+8801610000110", to: "+8801610000103", status: "accepted" }, // Imran -> Mehedi
  { from: "+8801610000106", to: "+8801610000111", status: "accepted" }, // Arif -> Razib
  { from: "+8801610000114", to: "+8801610000103", status: "pending" }, // Nayan -> Mehedi (incoming)
  { from: "+8801610000113", to: "+8801610000111", status: "pending" }, // Sumon -> Razib (incoming)
  { from: "+8801930000001", to: "+8801610000109", status: "pending" }, // Rakibul -> Sohel (outgoing)
]

async function main() {
  const db = neon(url)
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10)

  // ------------------------------------------------------------------
  // 1. Accounts: 2 turf owners, 2 team owners (both also players).
  // ------------------------------------------------------------------
  const ACCOUNTS = [
    {
      id: TURF_OWNER_1,
      phone: "+8801840000001",
      email: "shafiq.turf@demo.bd",
      name: "Shafiq Uddin",
      roles: ["turf_owner", "player"],
      position: "midfielder",
      skill: "intermediate",
      area: "Uttara Sector 7",
      avatarPresetId: "crest-shield",
      lat: 23.874,
      lng: 90.397,
      bio: "দুইটা টার্ফের মালিক — সন্ধ্যার ম্যাচে নিজেও মাঝ মাঠে নামি।",
      available: false,
    },
    {
      id: TURF_OWNER_2,
      phone: "+8801840000002",
      email: "nusrat.turf@demo.bd",
      name: "Nusrat Jahan",
      roles: ["turf_owner", "player"],
      position: "defender",
      skill: "casual",
      area: "Dhanmondi",
      avatarPresetId: "goal-net",
      lat: 23.747,
      lng: 90.377,
      bio: "Dhanmondi Arena-র মালিক। খেলা শেখা চলছে, ব্যবসা সামলাচ্ছি।",
      available: false,
    },
    {
      id: TEAM_OWNER_1,
      phone: "+8801930000001",
      email: "rakibul.team@demo.bd",
      name: "Rakibul Islam",
      roles: ["team_owner", "player"],
      position: "midfielder",
      skill: "good",
      area: "Mirpur 10",
      avatarPresetId: "jersey-classic",
      lat: 23.811,
      lng: 90.368,
      bio: "Dhaka Thunder-র ক্যাপ্টেন-কাম-মিডফিল্ডার। সপ্তাহে অন্তত এক ম্যাচ।",
      available: true,
    },
    {
      id: TEAM_OWNER_2,
      phone: "+8801930000002",
      email: "sabbir.team@demo.bd",
      name: "Sabbir Ahmed",
      roles: ["team_owner", "player"],
      position: "striker",
      skill: "good",
      area: "Uttara Sector 4",
      avatarPresetId: "number-9",
      lat: 23.869,
      lng: 90.403,
      bio: "Uttara Strikers গড়েছি পাড়ার ছেলেদের নিয়ে। প্রতিপক্ষ চাই!",
      available: true,
    },
  ]

  let seededUsers = 0
  for (const a of ACCOUNTS) {
    // xmax = 0 only on a fresh insert (the DO UPDATE branch marks the row
    // as updated), so re-runs report "already existed" correctly.
    const rows = await db`
      INSERT INTO users (id, phone, email, password_hash, email_verified_at, name, status)
      VALUES (${a.id}, ${a.phone}, ${a.email}, ${passwordHash}, now(), ${a.name}, 'active')
      ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
      RETURNING (xmax = 0) AS inserted`
    seededUsers += rows[0]?.inserted ? 1 : 0

    for (const role of a.roles) {
      await db`
        INSERT INTO user_roles (user_id, role)
        VALUES (${a.id}, ${role})
        ON CONFLICT DO NOTHING`
    }

    const p = PROFILES[a.id]
    // available=true accounts also need a recent availableAt for the 24h
    // freshness window (SS18 nearby-players discovery).
    await db`
      INSERT INTO player_profiles (
        user_id, player_id, username, position, skill, area, bio,
        avatar_type, avatar_preset_id, coords, available, available_at
      )
      VALUES (
        ${a.id}, ${p.playerId}, ${p.username}, ${a.position}, ${a.skill}, ${a.area}, ${a.bio},
        'preset', ${a.avatarPresetId},
        ST_SetSRID(ST_MakePoint(${a.lng}, ${a.lat}), 4326)::geography,
        ${a.available},
        CASE WHEN ${a.available} THEN now() - interval '30 minutes' END
      )
      ON CONFLICT (user_id) DO NOTHING`
  }

  // ------------------------------------------------------------------
  // 2. Reassign the three unused demo turfs to the demo turf owners.
  // ------------------------------------------------------------------
  for (const t of TURF_ASSIGNMENTS) {
    const before = await db`
      SELECT id, owner_id FROM turfs WHERE slug = ${t.slug}`
    const turf = before[0]
    if (!turf) {
      throw new Error(`Demo turf "${t.slug}" not found — seed it via the admin panel first`)
    }
    if (turf.owner_id && turf.owner_id !== t.ownerId) {
      console.log(`Reassigning turf "${t.slug}" to demo owner ${t.ownerId}`)
    }
    await db`
      UPDATE turfs SET owner_id = ${t.ownerId}, updated_at = now()
      WHERE id = ${turf.id}`
    await db`
      INSERT INTO turf_owners (turf_id, user_id)
      VALUES (${turf.id}, ${t.ownerId})
      ON CONFLICT DO NOTHING`
    t.id = turf.id
  }

  // ------------------------------------------------------------------
  // 3. Weekly schedules + sections, then materialize template slots for
  //    the next 21 days (today, Asia/Dhaka) so booking works before the
  //    Inngest cron runs. Sections and slots stay in lockstep.
  // ------------------------------------------------------------------
  for (const t of TURF_ASSIGNMENTS) {
    const plan = SLOT_PLAN[t.slug]
    const sched = await db`
      INSERT INTO turf_schedules (id, turf_id, name, is_active)
      VALUES (${plan.scheduleId}, ${t.id}, 'সাপ্তাহিক রুটিন', true)
      ON CONFLICT (id) DO NOTHING
      RETURNING id`
    if (sched.length === 0) {
      // Schedule exists — reset sections so re-runs normalize drift.
      await db`
        DELETE FROM turf_schedule_sections WHERE schedule_id = ${plan.scheduleId}`
    }
    for (const s of plan.sections) {
      await db`
        INSERT INTO turf_schedule_sections (
          schedule_id, day_of_week, label, start_time, end_time,
          slot_minutes, gap_minutes, price
        )
        SELECT ${plan.scheduleId}, d, ${s.label},
               make_time(${s.startHour}::int, 0, 0),
               make_time(${s.endHour}::int, 0, 0),
               60, 0, ${s.price}
        FROM generate_series(0, 6) AS d`

      const inserted = await db`
        INSERT INTO turf_slots (
          turf_id, date, start_time, duration_minutes, status, price, source, schedule_id
        )
        SELECT ${t.id}, (now() AT TIME ZONE 'Asia/Dhaka')::date + d, make_time(h, 0, 0), 60,
               'available', ${s.price}, 'template', ${plan.scheduleId}
        FROM generate_series(0, ${SLOT_DAYS_AHEAD}::int) AS d,
             generate_series(${s.startHour}::int, ${s.endHour - 1}::int) AS h
        ON CONFLICT DO NOTHING
        RETURNING turf_id`
      console.log(
        `Turf "${t.slug}" [${s.label}]: ${inserted.length} template slots ` +
          `(next ${SLOT_DAYS_AHEAD + 1} days)`
      )
    }
  }

  // ------------------------------------------------------------------
  // 4. Teams + rosters. Roster members are the seeded demo players,
  //    looked up by phone so the players seed stays the source of truth.
  // ------------------------------------------------------------------
  const userIdByPhone = {}
  // Rosters include the team owners themselves, so resolve their phones too.
  for (const a of ACCOUNTS) userIdByPhone[a.phone] = a.id
  for (const p of PLAYER_PHONES) {
    const rows = await db`SELECT id FROM users WHERE phone = ${p.phone}`
    if (!rows[0]) {
      throw new Error(`Demo player ${p.phone} missing — run db:seed:players first`)
    }
    userIdByPhone[p.phone] = rows[0].id
  }
  const uid = (phone) => userIdByPhone[phone]

  for (const t of TEAMS) {
    await db`
      INSERT INTO teams (id, slug, name)
      VALUES (${t.id}, ${t.slug}, ${t.name})
      ON CONFLICT (slug) DO NOTHING`
    for (const m of t.members) {
      await db`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (${t.id}, ${uid(m.phone)}, ${m.role})
        ON CONFLICT DO NOTHING`
    }
    if (t.pendingInvitePhone) {
      // Unregistered phone: createRegisteredUser fulfills this row on
      // signup, auto-adding the new user to the team as 'player'. No DB
      // unique constraint backs the one-pending-per-(team, phone) rule —
      // the app enforces it — so guard the insert here.
      await db`
        INSERT INTO team_invitations (team_id, phone, role, invited_by)
        SELECT ${t.id}, ${t.pendingInvitePhone}, 'player', ${t.ownerId}
        WHERE NOT EXISTS (
          SELECT 1 FROM team_invitations
          WHERE team_id = ${t.id}
            AND phone = ${t.pendingInvitePhone}
            AND fulfilled_at IS NULL
        )`
    }
  }

  // ------------------------------------------------------------------
  // 5. Friendships among demo players: a few accepted pairs + pending
  //    incoming requests for each team captain (so the requests tab has
  //    content when testing as a captain).
  // ------------------------------------------------------------------
  for (const f of FRIENDSHIPS) {
    await db`
      INSERT INTO friendships (requester_id, addressee_id, status, responded_at)
      VALUES (${uid(f.from)}, ${uid(f.to)}, ${f.status},
              ${f.status === "accepted" ? new Date() : null})
      ON CONFLICT DO NOTHING`
  }

  // ------------------------------------------------------------------
  // 6. ERP data for Shafiq (turf owner 1) only — Nusrat stays clean so
  //    the ERP onboarding/trial-start flow can be tested from scratch.
  // ------------------------------------------------------------------
  const erpCatIds = {}
  for (const slug of ERP_CATEGORY_SLUGS) {
    const name = slug
      .split("_")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")
    await db`
      INSERT INTO erp_expense_categories (owner_id, slug, name, kind, is_system)
      VALUES (${TURF_OWNER_1}, ${slug}, ${name},
              ${ERP_FIXED_KIND.has(slug) ? "fixed" : "variable"}, true)
      ON CONFLICT (owner_id, slug) DO NOTHING`
    const row = await db`
      SELECT id FROM erp_expense_categories
      WHERE owner_id = ${TURF_OWNER_1} AND slug = ${slug}`
    erpCatIds[slug] = row[0].id
  }

  await db`
    INSERT INTO erp_profiles (owner_id, trial_starts_at, trial_ends_at, plan, onboarded_at)
    VALUES (${TURF_OWNER_1}, now() - interval '7 days', now() + interval '23 days',
            'free', now() - interval '7 days')
    ON CONFLICT (owner_id) DO NOTHING`

  await db`
    INSERT INTO erp_rent_contracts (
      id, owner_id, turf_id, monthly_amount, agreement_start,
      landlord_name, landlord_phone, security_deposit, note, is_active
    )
    VALUES (
      ${erp("0001")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, 45000,
      (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '5 months',
      'আব্দুল করিম', '+8801711223344', 90000,
      'চুক্তি অনুযায়ী প্রতি মাসের ৫ তারিখের মধ্যে ভাড়া পরিশোধ।', true
    )
    ON CONFLICT DO NOTHING`

  await db`
    INSERT INTO erp_recurring_rules (id, owner_id, turf_id, category_id, name, amount, frequency, next_due_date, auto_post)
    VALUES
      (${erp("0011")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.rent},
       'মাসিক ভাড়া — Uttara Fives Club', 45000, 'monthly',
       (date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka') + interval '1 month')::date,
       false),
      (${erp("0012")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.electricity},
       'বিদ্যুৎ বিল', 6000, 'monthly',
       (date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka') + interval '10 days')::date,
       false)
    ON CONFLICT DO NOTHING`

  await db`
    INSERT INTO erp_expenses (id, owner_id, turf_id, category_id, source, amount, date, vendor, note, created_by)
    VALUES
      (${erp("0101")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.rent}, 'recurring', 45000,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '20 days', 'আব্দুল করিম', 'গত মাসের ভাড়া', ${TURF_OWNER_1}),
      (${erp("0102")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.electricity}, 'bill', 5820,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '18 days', 'DESCO', null, ${TURF_OWNER_1}),
      (${erp("0103")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.internet}, 'bill', 1200,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '15 days', 'Link3', null, ${TURF_OWNER_1}),
      (${erp("0104")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.cleaning}, 'manual', 900,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '12 days', null, 'মাসিক ক্লিনিং', ${TURF_OWNER_1}),
      (${erp("0105")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, ${erpCatIds.equipment}, 'manual', 3500,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '9 days', 'Sports BD', 'নতুন গোল নেট ২টি', ${TURF_OWNER_1}),
      (${erp("0106")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[1].id}, ${erpCatIds.maintenance}, 'manual', 4200,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '6 days', 'Green Grass BD', 'ঘাস রিপেয়ার', ${TURF_OWNER_1}),
      (${erp("0107")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[1].id}, ${erpCatIds.marketing}, 'manual', 2000,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '3 days', null, 'ফেসবুক বুস্ট', ${TURF_OWNER_1}),
      (${erp("0108")}, ${TURF_OWNER_1}, null, ${erpCatIds.water}, 'manual', 450,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '1 day', null, null, ${TURF_OWNER_1})
    ON CONFLICT DO NOTHING`

  await db`
    INSERT INTO erp_staff (id, owner_id, turf_id, name, phone, position, joined_at, status, salary_type, base_salary)
    VALUES
      (${erp("0201")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, 'Jahangir Alam',
       '+8801822555666', 'manager',
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '10 months', 'active', 'monthly', 18000),
      (${erp("0202")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, 'Sobuj Mia',
       '+8801822555777', 'ground_staff',
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '4 months', 'active', 'monthly', 12000)
    ON CONFLICT DO NOTHING`

  await db`
    INSERT INTO erp_other_income (id, owner_id, turf_id, amount, date, source, note)
    VALUES
      (${erp("0301")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, 5000,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '8 days', 'tournament', 'উইকেন্ড টুর্নামেন্ট এন্ট্রি ফি'),
      (${erp("0302")}, ${TURF_OWNER_1}, ${TURF_ASSIGNMENTS[0].id}, 2400,
       (now() AT TIME ZONE 'Asia/Dhaka')::date - interval '2 days', 'matchFee', 'অফ-প্ল্যাটফর্ম ম্যাচ ফি')
    ON CONFLICT DO NOTHING`

  console.log(
    `Accounts: ${seededUsers} new, ${ACCOUNTS.length - seededUsers} already existed.`
  )
  console.log(`Teams: ${TEAMS.map((t) => t.name).join(", ")}`)
  console.log(`Sign in with any demo phone below + password "${DEMO_PASSWORD}":`)
  for (const a of ACCOUNTS) {
    console.log(`  ${a.phone}  ${a.name} (${a.roles.join(" + ")})`)
  }
}

main().catch((err) => {
  console.error("Failed:", err.message)
  if (err.where) console.error("At:", err.where)
  console.error(err.stack)
  process.exit(1)
})
