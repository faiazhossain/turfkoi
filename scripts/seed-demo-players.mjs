// Seed demo players so matchmaking features (nearby players list, map pins,
// player search) have data to show against the real turfs.
//
// Usage: node --env-file=.env scripts/seed-demo-players.mjs
//
// - Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, safe to re-run.
// - Every demo account signs in with phone + DEMO_PASSWORD (dev only!).
// - Coords are pre-rounded to 3 decimals (~110m), matching the app's own
//   write-time privacy behavior, and clustered near real turfs so the
//   10km ST_DWithin discovery query finds them.
// - available=true with a recent availableAt so the 24h freshness window
//   (SS18) passes.
import { neon } from "@neondatabase/serverless"
import bcrypt from "bcryptjs"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const DEMO_PASSWORD = "demo1234"

// Catalog ids from src/features/player/avatar-catalog.ts (server actions
// enforce this whitelist, so anything else would render the fallback).
const PLAYERS = [
  { phone: "+8801610000101", name: "Rakib Hasan", position: "goalkeeper", secondaryPosition: null, skill: "intermediate", area: "Dhanmondi", avatarPresetId: "goal-frame", lat: 23.747, lng: 90.377, bio: "গোলরক্ষক হিসেবে ৫ বছরের অভিজ্ঞতা। পেনাল্টি পড়তে ভালোবাসি।" },
  { phone: "+8801610000102", name: "Tanvir Ahmed", position: "defender", secondaryPosition: "midfielder", skill: "good", area: "Dhanmondi 27", avatarPresetId: "shin-guard", lat: 23.749, lng: 90.379, bio: "সেন্টার-ব্যাক পজিশনই ঘর। হেডার আর ট্যাকলিংয়ে ভরসা রাখতে পারেন।" },
  { phone: "+8801610000103", name: "Mehedi Hasan", position: "striker", secondaryPosition: "forward", skill: "competitive", area: "Mohammadpur", avatarPresetId: "number-9", lat: 23.755, lng: 90.366, bio: "বক্সের ভেতরে থাকলে সুযোগ হাতছাড়া করি না। সপ্তাহে ২-৩টা ম্যাচ খেলি।" },
  { phone: "+8801610000104", name: "Sakib Al Mahmud", position: "midfielder", secondaryPosition: null, skill: "good", area: "Lalbagh", avatarPresetId: "number-10", lat: 23.741, lng: 90.386, bio: "প্লেমেকার — পাস দিয়ে খেলা বানাতে পছন্দ করি।" },
  { phone: "+8801610000105", name: "Naimur Rahman", position: "winger", secondaryPosition: "forward", skill: "casual", area: "Mohammadpur", avatarPresetId: "speed-lines", lat: 23.762, lng: 90.371, bio: "দ্রুতগতির উইঙ্গার। ম্যাচের আগে একটু ওয়ার্ম-আপ জরুরি!" },
  { phone: "+8801610000106", name: "Arif Hossain", position: "defender", secondaryPosition: null, skill: "intermediate", area: "Banani", avatarPresetId: "crest-shield", lat: 23.793, lng: 90.4, bio: "রাইট-ব্যাক হিসেবে খেলি, দরকারে ডান দিকের উইঙ্গারও।" },
  { phone: "+8801610000107", name: "Jibon Sheikh", position: "midfielder", secondaryPosition: "defender", skill: "casual", area: "Gulshan 2", avatarPresetId: "training-cone", lat: 23.792, lng: 90.413, bio: "অফিসের পর সন্ধ্যার ম্যাচ মানে দিনের সেরা সময়।" },
  { phone: "+8801610000108", name: "Fahim Mridha", position: "forward", secondaryPosition: "winger", skill: "good", area: "Badda", avatarPresetId: "ball-gold", lat: 23.781, lng: 90.428, bio: "গতি আর ড্রিবল — কাউন্টার অ্যাটাকে ভরসা।" },
  { phone: "+8801610000109", name: "Sohel Rana", position: "goalkeeper", secondaryPosition: null, skill: "learning", area: "Mirpur 10", avatarPresetId: "goal-net", lat: 23.811, lng: 90.368, bio: "নতুন গোলরক্ষক, শিখছি। অনুশীলনের জন্য যেকোনো ম্যাচে রাজি।" },
  { phone: "+8801610000110", name: "Imran Kabir", position: "midfielder", secondaryPosition: "winger", skill: "intermediate", area: "Kazipara", avatarPresetId: "jersey-classic", lat: 23.817, lng: 90.362, bio: "বক্স-টু-বক্স মিডফিল্ডার — হাই প্রেসে ভালো খেলি।" },
  { phone: "+8801610000111", name: "Razib Chowdhury", position: "defender", secondaryPosition: "midfielder", skill: "competitive", area: "Mirpur DOHS", avatarPresetId: "captain-armband", lat: 23.822, lng: 90.372, bio: "দলকে গোল থেকে বাঁচানোই কাজ। লেফট-ব্যাক আর সিডিএম দুটোতেই খেলি।" },
  { phone: "+8801610000112", name: "Tuhin Mia", position: "winger", secondaryPosition: null, skill: "intermediate", area: "Uttara Sector 7", avatarPresetId: "number-7", lat: 23.874, lng: 90.397, bio: "বাঁ পাশ দিয়ে চলাই প্রিয়, কাট-ব্যাক ক্রস আমার সিগনেচার।" },
  { phone: "+8801610000113", name: "Sumon Barua", position: "striker", secondaryPosition: null, skill: "good", area: "Uttara Sector 4", avatarPresetId: "number-11", lat: 23.869, lng: 90.403, bio: "ফিনিশিং স্কুলে যারা ভর্তি হতে চায়, তাদের জন্য ডেমো!" },
  { phone: "+8801610000114", name: "Nayan Islam", position: "midfielder", secondaryPosition: null, skill: "learning", area: "Uttara Sector 10", avatarPresetId: "pitch-lines", lat: 23.879, lng: 90.401, bio: "নতুন খেলোয়াড় — যেকোনো পজিশনে মাঠে নামতে রাজি।" },
]

// Fixed UUIDv4-shaped ids (d5 = "demo" mnemonic) keep re-runs stable.
const userId = (i) =>
  `d5000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`

async function main() {
  const db = neon(url)
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10)

  let seeded = 0
  for (let i = 0; i < PLAYERS.length; i++) {
    const p = PLAYERS[i]
    const id = userId(i)
    // A spread of "minutes ago" keeps every profile inside the 24h
    // freshness window while the map/list doesn't look frozen at one instant.
    const minutesAgo = 5 + i * 17
    const rows = await db`
      WITH ins_user AS (
        INSERT INTO users (id, phone, password_hash, name, status)
        VALUES (${id}, ${p.phone}, ${passwordHash}, ${p.name}, 'active')
        ON CONFLICT DO NOTHING
        RETURNING id
      ), ins_role AS (
        INSERT INTO user_roles (user_id, role)
        VALUES (${id}, 'player')
        ON CONFLICT DO NOTHING
        RETURNING user_id
      ), ins_profile AS (
        INSERT INTO player_profiles (
          user_id, position, secondary_position, skill, area, bio,
          avatar_type, avatar_preset_id, coords, available, available_at
        )
        VALUES (
          ${id}, ${p.position}, ${p.secondaryPosition}, ${p.skill}, ${p.area}, ${p.bio},
          'preset', ${p.avatarPresetId},
          ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
          true, now() - (${minutesAgo} * interval '1 minute')
        )
        ON CONFLICT (user_id) DO UPDATE
          SET available = true,
              available_at = EXCLUDED.available_at
        RETURNING user_id
      )
      SELECT (SELECT count(*) FROM ins_user) AS inserted`
    // neon returns BIGINT counts as strings — coerce before adding.
    seeded += Number(rows[0]?.inserted ?? 0)
  }

  console.log(
    seeded > 0
      ? `Seeded ${seeded} demo players (${PLAYERS.length - seeded} already existed).`
      : `All ${PLAYERS.length} demo players already exist — nothing to do.`
  )
  console.log(`Sign in with any phone below + password "${DEMO_PASSWORD}":`)
  for (const p of PLAYERS) {
    console.log(`  ${p.phone}  ${p.name} (${p.area})`)
  }
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
