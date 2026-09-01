# Demo Accounts

Dev/demo database only — **never** use these phones or passwords in production.
All demo accounts share the password `demo1234` and sign in at `/login` with
their phone number.

Re-seed any time (idempotent, safe to re-run):

```bash
npm run db:seed:players    # 14 solo players
npm run db:seed:accounts   # turf owners, team owners, teams, ERP, friends
```

## Removing demo data (before publishing)

```bash
npm run db:demo:reset          # dry run: shows exactly what would go
npm run db:demo:reset -- --yes # actually delete
```

Deletes only demo rows — every user with a `d5000000-…` uuid, the demo
teams/rosters/invitation, and the schedules + slots on the three demo
turfs (ownership goes back to NULL = unclaimed). Real accounts (admin,
personal, Foysal) and their data are untouched. The three demo turfs
themselves are kept; drop them manually if you want them gone too.

## Turf owners

| Name         | Phone            | Email                  | Owns |
| ------------ | ---------------- | ---------------------- | ---- |
| Shafiq Uddin | +8801840000001   | shafiq.turf@demo.bd    | Uttara Fives Club, Gulshan Turf 7s |
| Nusrat Jahan | +8801840000002   | nusrat.turf@demo.bd    | Dhanmondi Arena (demo) |

Test with them: turf-owner dashboard, schedule builder, slot management,
bookings list, image uploads, ERP (ব্যবসা).

- **Shafiq** has ERP data ready: 1 rent contract, 2 recurring rules (rent +
  electricity), 8 expenses across the last 20 days, 2 staff (manager +
  ground staff), 2 other-income rows, 11 system categories.
- **Nusrat** is deliberately clean — use her to test the ERP onboarding /
  trial-start flow from scratch.

All three demo turfs have weekly schedules and materialized template slots
for the next 21 days, so booking works immediately without waiting for the
daily Inngest materialization cron.

> Note: these three `demo-*` turfs previously belonged to the project
> owner's personal account (+8801521425927). To move them back:
>
> ```sql
> UPDATE turfs SET owner_id = (SELECT id FROM users WHERE phone = '+8801521425927')
> WHERE slug IN ('demo-uttara-fives', 'demo-dhanmondi-arena', 'demo-gulshan-turf-7s');
> ```

## Team owners / captains

| Name          | Phone            | Team            | Team role(s)        |
| ------------- | ---------------- | --------------- | ------------------- |
| Rakibul Islam | +8801930000001   | Dhaka Thunder   | owner (RBAC team_owner) |
| Sabbir Ahmed  | +8801930000002   | Uttara Strikers | owner (RBAC team_owner) |

Test with them: creating a team, roster management, the match wizard
(team match, players-ready path, opponent invites).

### Rosters

- **Dhaka Thunder** (slug `dhaka-thunder`) — 7 members: owner Rakibul,
  captain **Mehedi Hasan** (+8801610000103), players Tanvir, Sakib Al
  Mahmud, Naimur, Fahim, Imran.
- **Uttara Strikers** (slug `uttara-strikers`) — 6 members: owner Sabbir,
  captain **Razib Chowdhury** (+8801610000111), players Rakib Hasan, Arif,
  Jibon, Tuhin.

Sign in as a captain (Mehedi or Razib — regular players, password
`demo1234`) to test captain-only permissions: squad management, match
invitations, result submission.

### Pending team invitation (unregistered phone)

`+8801930000003` has a pending invitation to **Uttara Strikers**. Register
a new account with that phone and signup should auto-join the team as a
player (invite fulfillment flow).

## Solo players

From `scripts/seed-demo-players.mjs` — all password `demo1234`:

| Phone            | Name            | Position              | Area            |
| ---------------- | --------------- | --------------------- | --------------- |
| +8801610000101   | Rakib Hasan     | goalkeeper            | Dhanmondi       |
| +8801610000102   | Tanvir Ahmed    | defender              | Dhanmondi 27    |
| +8801610000103   | Mehedi Hasan    | striker (T1 captain)  | Mohammadpur     |
| +8801610000104   | Sakib Al Mahmud | midfielder            | Lalbagh         |
| +8801610000105   | Naimur Rahman   | winger                | Mohammadpur     |
| +8801610000106   | Arif Hossain    | defender              | Banani          |
| +8801610000107   | Jibon Sheikh    | midfielder            | Gulshan 2       |
| +8801610000108   | Fahim Mridha    | forward               | Badda           |
| +8801610000109   | Sohel Rana      | goalkeeper (free agent)| Mirpur 10      |
| +8801610000110   | Imran Kabir     | midfielder            | Kazipara        |
| +8801610000111   | Razib Chowdhury | defender (T2 captain) | Mirpur DOHS     |
| +8801610000112   | Tuhin Mia       | winger                | Uttara Sector 7 |
| +8801610000113   | Sumon Barua     | striker               | Uttara Sector 4 |
| +8801610000114   | Nayan Islam     | midfielder            | Uttara Sector 10 |

Sohel, Sumon, and Nayan are on no team — use them for solo sign-up paths,
match seat requests, and "available tonight" discovery (all three demo
player cohorts have `available=true` with recent timestamps).

## Friends

- Accepted: Mehedi ↔ Tanvir, Sakib → Mehedi, Imran → Mehedi,
  Arif → Razib.
- Pending (incoming): Nayan → Mehedi, Sumon → Razib.
- Pending (outgoing): Rakibul → Sohel.

## Admin

The admin account already exists in the DB — `01700000000` /
`admin@turfkoi.bd` (roles: admin + player + turf_owner). Its password was
set when the account was created and is **not** part of the demo seed;
reset it yourself if forgotten (say the word and it can be reset to
`demo1234`).

## Not seeded (create via UI)

- **Matches** — create through the match wizard while signed in as a team
  owner/captain; teams, players, slots, and turfs are all in place.
- **Bookings / payments** — exercise the real hold → payment → confirm
  flow on any demo turf slot.
- Match guests, opponent requests, reports, refund requests — all flow from
  the above.
