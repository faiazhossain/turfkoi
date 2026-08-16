# Turfkoi — Features

What Turfkoi actually does, organized by who's using it. Written from the
built code (`src/app/`, `src/db/schema/`, `src/features/`), not from the
original spec — divergences from `PROJECT_REQUIREMENTS.md` are noted where
they happened.

## TL;DR

Turfkoi is a football-turf booking + matchmaking platform built for
Bangladesh. Phone + OTP sign-in. Book a turf, find an opposing team, fill
missing roster spots, play. Prices in Taka (BDT). Payments via bKash. Map-
based discovery. Mobile-first, dark-themed.

## Tech stack (as actually wired)

| Concern | Choice | Where |
|---|---|---|
| App | Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui (Base UI) | repo root |
| Data fetching | RSC for SSR reads, TanStack Query for client reads, Server Actions for mutations | `src/features/*/` |
| Forms | react-hook-form + zod | `src/components/*/` |
| DB | Neon Postgres + PostGIS, Drizzle ORM | `src/db/`, `drizzle/` |
| Background jobs | Inngest (`slot-hold-expire`, `settle-at-kickoff`, `account-hard-anonymize`) | `src/lib/inngest.ts` |
| Realtime | Pusher (provider wired, called from match + team flows) | `src/lib/realtime.ts` |
| Rate limit / cache | Upstash Redis | `src/lib/ratelimit.ts` |
| Analytics | PostHog (P1 — provider imported, calls deferred) | — |
| Auth | Auth.js v5 (phone/email + bcrypt password, email OTP for registration + reset, JWT in httpOnly cookie) | `src/auth.config.ts`, `src/features/auth/` |
| Payments | bKash only (Nagad deferred to P1) | `src/lib/payment.ts`, `src/app/api/payments/bkash/` |
| Storage | S3-compatible (R2) presigned PUT uploads + magic-byte verify | `src/features/turfs/storage.ts`, `src/lib/file-validation.ts` |
| Deploy | Vercel | — |

Schema: **26 tables** across 8 files (`src/db/schema/`) + **19 enums**.

---

## Player

Routes: `/app` (dashboard), `/app/settings`, `/matches`, `/matches/[id]`,
`/bookings/[id]`.

- **Registration + password sign-in** — register once with name + phone +
  email + password; a 6-digit code sent to the email (mocked in dev: console
  + dev badge; production sends via Resend) verifies the address. After
  that, sign in with phone OR email + password - no OTP on login. Email OTP
  also authorizes password resets. Brute-force protection (D2): 5-attempt
  OTP lockout, 60s resend, per-email + per-IP Upstash rate limits, login
  rate limits + one generic credential error (anti-enumeration). First
  sign-in creates the user + auto-fulfills any pending team invitations for
  that phone.
- **Onboarding** — first-run: name, position, skill, area. `/auth/onboarding`.
- **Availability toggle** — "play tonight" flag (`/app`); when on + recent, the
  player appears in nearby "needs players" discovery.
- **Find a game** — `/matches` lists matches near the player's coords needing
  players (PostGIS `ST_DWithin`, geo-sorted). One-tap join request; captain
  approves/rejects.
- **Your bookings** — upcoming + recent; drill into `/bookings/[id]` for
  payment status, cancellation, receipt.
- **Match history + "I played"** — past matches with score; confirm
  attendance after kickoff.
- **Invite friends (referral, A3)** — each player gets a stable code at
  `/invite/<code>`; landing page stamps a 30-day cookie and bounces to
  `/login`. The cookie attributes the signup to the referrer. **Rewards are
  P1 — only the attribution scaffold ships.**
- **Settings / delete account (K3)** — `/app/settings`. Soft-deletes
  immediately, signs out, schedules a 14-day grace window. The Inngest
  `account-hard-anonymize` job then erases name / phone (→
  `deleted:<hash>@local`) / email / coords. Audit history is retained
  (hashed-id only).

## Team

Routes: `/team`, `/team/new`, `/team/[slug]`, `/team/[slug]/edit`.

- **Team CRUD** — create, edit, transfer ownership, delete.
- **Roster + roles** — owner / captain / manager / player (team-internal
  roles, distinct from RBAC user roles). Ownership lives in `team_members`
  only (no denormalized `teams.owner_id` — audit F6).
- **Phone-based invites** — captain enters a phone; if the user exists,
  they're added to `team_members` immediately; otherwise a `team_invitations`
  row is stored and auto-fulfilled on first signup.
- **Multi-team switcher** — users in 2+ teams get a context picker (E2).
- **Matchmaking** — see below.

## Matchmaking

Two layers, both sharing the `matches` table.

### Team matchmaking (Phase 5)

- A team creates a match against a slot (`createMatchAction`). Match state
  machine: `draft → open → opponent_found → payment_pending → confirmed →
  roster_building → ready → ongoing → completed | cancelled | disputed`.
- **Pay-then-roster** (C1) — booking is paid *before* roster build. Booking
  state vs match state authority is defined (C2): booking state is the
  source of truth for "is this slot paid for"; match state for "is this
  game happening".
- Opponents find open matches and request to play; creator accepts
  (`acceptAsOpponentAction`).
- Roster building: captains add/remove players; guest roster supported
  (Phase 6).
- **Result submission** (F1) — one captain submits score + state →
  `completed`; the other confirms. A disputed result sets `result_status =
  'disputed'` for admin review.

### Player matchmaking (Phase 6)

- Availability + "needs players" supply (SS18).
- Nearby matches geo-sorted via PostGIS (SS20).
- Join requests → captain approval.
- Guest roster support.
- Player match history + "I played" confirmation (F2).
- Match-day UX: pre-match card, attendance, directions (E3).

## Turf owner

Routes: `/turf-owner`, `/turf-owner/turfs/new`, `/turf-owner/turfs/[id]`.

- **Turf CRUD** — name, location (PostGIS point), format (5-a-side / 7-a-side),
  facilities, photos (presigned R2 upload + magic-byte verify), per-turf-owner
  cancellation policy.
- **Slot generation** — owner-configurable slot length (60 / 90 min, Q5);
  bulk-generate a week+ of slots with peak/holiday pricing.
- **Owner dashboard** — KPI tiles (today's revenue, upcoming bookings, open
  slots, 7-day occupancy), "my turfs" list, **"Fill This Slot"** surface
  (unsold inventory in the next 7 days, promotable once matchmaking
  launches).
- **Verification gate** — turfs are admin-verified before going live (SS35).
  Unverified turfs are hidden from public discovery.
- **Cancellation policy** — owner picks a template at turf setup; platform
  default applies if unset. The chosen policy is surfaced to the booker
  before payment (transparency). See money flow below.

## Admin

Routes: `/admin`, `/admin/{users,turfs,teams,bookings,matches,transactions,reports}`.

- **Overview** — KPI tiles (users / turfs / teams / active bookings / 30-day
  revenue / failed txns / pending payouts / open reports) + a "needs
  attention" queue (pending refunds, disputed matches, open reports).
- **Payouts** — generate weekly payout rows from settled (completed)
  transactions per turf owner; mark paid after the manual bKash send-money.
- **Users** — search by phone, suspend/activate, add/remove roles
  (`admin / turf_owner / team_owner / player`). Self-suspend blocked.
- **Turfs** — verify pending turfs (filter by pending/verified/all).
- **Teams** — read-only roster summary.
- **Bookings + refunds** — filterable list; per-booking refund flow.
  **Refunds > Tk5,000 require a second admin (H4 dual-control)**: requester
  can't self-approve. Below the threshold, executes inline. Either way a
  `refund_requests` row is staged for audit. Refunds come out of the turf
  owner's share; the platform fee is not refunded.
- **Disputes (B4)** — list disputed matches; admin confirms (optionally
  overriding the score) or scratches (cancels).
- **Transactions** — every transaction incl. failed; filter by status.
- **Reports** — status workflow (pending → reviewing → resolved / dismissed).

## Booking & money flow

Routes: `/turfs`, `/turfs/[slug]`, `/bookings/[id]`, `/api/payments/bkash/{callback,webhook}`, `/api/payments/bkash/...` (dev: `/bookings/[id]/pay/mock`).

**Locked money-flow model** (audit B1–B5):

1. **Discovery** — `/turfs` (PostGIS radius search + area substring fallback);
  drill into `/turfs/[slug]` for live slot grid.
2. **Hold** — `holdSlotAction` claims a slot for 10 minutes (slot_hold TTL +
  conditional UPDATE on `turf_slots.status = available → held`). Partial
  unique index `bookings_active_unique` rejects a double-booking race.
3. **Pay** — bKash only (B6; Nagad P1). Booker pays platform upfront: turf
  price + ~5% fee (capped ~Tk100). Platform holds the funds.
4. **Confirm** — webhook verifies **both signature AND source IP allowlist**
  (H3). Idempotent via `provider_reference` unique constraint. Booking flips
  to `confirmed`; slot → `booked`.
5. **Settle at kickoff** — Inngest `settle-at-kickoff` flips `confirmed →
  completed` at kickoff. The transaction becomes payout-eligible.
6. **Weekly payout** — admin triggers `generateWeeklyPayoutsAction`; one
  `payouts` row per owner for the week's settled transactions. After the
  manual bKash send-money, admin marks paid.
7. **Cancellation** — per-turf-owner policy (flexible / moderate tiered /
  re-book-contingent / strict). Cancelling re-opens the slot automatically.
  Refund amount computed by `computeRefund` in `src/lib/cancellation.ts`.

**Concurrency** — neon-http can't `SELECT … FOR UPDATE` in a transaction.
J2's *intent* is satisfied with three layered primitives instead: the partial
unique index, client-generated idempotency keys (J3), and conditional
`UPDATE … WHERE status=…` transitions. Safer on serverless than row-level
locks.

**Single payer only** (B5) — payment split between Team A + Team B is P1.

## Public surfaces

- `/` — landing.
- `/turfs`, `/turfs/[slug]` — discovery + turf detail (dynamic OG metadata,
  canonical).
- `/matches`, `/matches/[id]` — public match directory.
- `/invite/[code]` — referral landing.
- `/login`, `/register`, `/forgot-password`, `/auth/onboarding` — auth flow.
- `sitemap.xml`, `robots.txt` — SEO (authenticated routes disallowed).

## Production hardening (Phase 8)

- **Threat model** — `docs/THREAT_MODEL.md` (STRIDE per surface).
- **Audit immutability (H2)** — `drizzle/audit-role.sql` defines an INSERT-
  only `audit_app` role; UPDATE/DELETE revoked.
- **Magic-byte file validation (H5)** — `src/lib/file-validation.ts` sniffs
  the leading bytes of each uploaded image; mismatches are deleted from R2.
  Extension / content-type alone is never trusted.
- **Structured logger (H6)** — `src/lib/logger.ts` emits JSON lines with
  phone / email / UUID / bKash-trxId pre-redacted. Adopted on the money
  paths.
- **Account deletion (K3)** — see Player section.
- **Performance (J1)** — `docs/PERFORMANCE.md`; `withTiming` emits
  `Server-Timing` + a structured `perf` log on the three hot paths.
- **DR (K1)** — `docs/DR.md` Neon PITR runbook + quarterly drill checklist.
- **Alerting (K2)** — `docs/ALERTING.md` thresholds (provider-neutral).
- **Negative tests (J5)** — vitest + 15 passing tests covering cancellation
  policy boundaries, magic-byte spoof detection, the H4 threshold.
- **A11y / contrast (L2)** — re-audit appended to
  `docs/CONTRAST_AUDIT.md`. Status never colour-alone (SS17).

## Deferred to P1 (explicitly, per `AUDIT_DECISIONS.md`)

- Nagad (B6), payment split (B5), light mode (I2), referral **rewards** (A3),
- browser-based E2E harness (J5 — only the server-action layer ships now),
- a real telemetry provider (K2 — only thresholds + runbook ship now),
- analytics events wired through PostHog.
