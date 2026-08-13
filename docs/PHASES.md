# Turfkoi — Phase Tracker & Build Handoff

> **Single source of truth for build progress.** To do the next work, tell Claude:
> **`/next-phase`** — or paste: *"Read docs/PHASES.md and implement the next
> incomplete phase."* Claude finds the first unfinished phase, builds it by the
> rules below, then updates this checklist and commits.

## How this works

- Progress lives **in this file** (committed to the repo) — not in chat memory —
  so it survives window closes and works on any machine with the repo cloned.
- Status: `[x]` done · `[~]` in progress · `[ ]` not started.
- **Next phase** = a `[~]` if one exists (resume it), otherwise the first `[ ]`.
- After finishing a phase: mark it `[x]`, commit, and record any new product
  decisions in `AUDIT_DECISIONS.md`.

## When the build is complete

When the last phase is marked `[x]`, `/next-phase` stops building and finalizes
the project: it creates `docs/FEATURES.md` (product docs written from the actual
code), updates `README.md` to a features overview, and **deletes this file and
the `/next-phase` command** — the tracker is scaffolding, no longer needed once
the product is documented.

## Progress

- [x] **0. Foundation** — scaffold, design tokens (+ contrast audit), full Drizzle schema, app shell, infra stubs, CI
- [x] **1. Auth & users**
- [x] **2. Turf management**
- [x] **3. Booking & payments**
- [x] **4. Team management**
- [x] **5. Team matchmaking**
- [x] **6. Player matchmaking**
- [x] **7. Admin**
- [ ] **8. Production hardening**

## Phase scopes (what "done" means for each)

**0. Foundation** — DONE. Next.js 16 + TS + Tailwind v4 + shadcn/ui (Base UI);
dark tokens + `docs/CONTRAST_AUDIT.md`; 21-table Drizzle schema with all audit
additions (F1-F8, per-turf-owner `cancellation_policy`); app shell + route
groups; `src/lib/` stubs; CI.

**1. Auth & users** — phone + OTP auth via Auth.js (JWT in httpOnly secure
cookie); OTP **mocked in dev** (fixed code + console log + dev toast), with a
provider interface kept so a BD SMS gateway drops in later; brute-force
protection [D2: 6-digit, 5-attempt lockout, 60s resend, per-phone Upstash rate
limit]; roles; capability RBAC wired to the real `can()` in
`src/lib/capabilities.ts`; middleware-protected `(auth)` routes → `/login`;
phone-entry + OTP-verify screens; first-run onboarding [E1]; account soft-delete
stub [K3]. _Decisions: D1, D2, E1, K3._

**2. Turf management** — turf CRUD (facilities, photos, format); PostGIS
location + BariKoi/MapLibre discovery; slots with the formalized composite PK +
status enum [F8]; pricing (peak/holiday); storage via presigned R2 uploads;
turf-owner dashboard with KPI tiles; the "Fill This Slot" feature.
_F8; SS24-26, SS32._

**3. Booking & payments** — turf discovery + slot selection; `slot_holds` with
TTL [F3]; booking + fee breakdown; bKash only [B6] with the **money-flow model**
(platform-captured, per-turf-owner `cancellation_policy` =
flexible/moderate/rebook_contingent/strict, settle-at-kickoff Inngest job,
weekly admin-triggered bKash payouts); cancellations [F4] + payouts [F5]; webhook
signature **and** IP allowlist [H3]; payment-failure retry screen [E4];
idempotency keys [J3]; `SELECT … FOR UPDATE` + READ COMMITTED [J2].
_B1-B6, F3-F5, H3, J2, J3, E4._

**4. Team management** — team CRUD; members + invitations; team-internal roles
(owner/captain/manager/player) in `team_members` (ownership lives there only,
F6); team dashboard; multi-team context switcher [E2]. _F6, E2._

**5. Team matchmaking** — create match; find/accept opponent; the match state
machine reconciled to pay-then-roster [C1]; booking-state vs match-state
authority defined [C2]; match result + score fields [F1]; `ONGOING → COMPLETED`.
_C1, C2, F1._

**6. Player matchmaking** — player availability; "needs players" supply;
nearby matches (geo-sorted); join requests + captain approval; guest roster;
player match history + "I played" confirmation [F2]; match-day UX [E3].
_F2, E3; SS18, SS20, SS32._

**7. Admin** — manage users / turfs (verify) / teams / players / matches /
bookings; transactions / revenue / refunds / **payouts** (trigger weekly) /
failed; dispute resolution [B4] with dual-control on refunds > Tk5,000 [H4];
reports. _B4, H4; SS35-36._

**8. Production hardening** — threat model [H1]; INSERT-only audit role [H2];
magic-byte file validation [H5]; structured logger with PII redaction [H6];
backup RPO/RTO + restore drill [K1]; alerting thresholds [K2]; full account
deletion workflow [K3]; backend perf targets [J1]; negative E2E tests [J5];
SEO; final a11y + contrast re-audit [L2]; referral growth loop [A3, P1].
_H1-H6, K1-K3, J1, J5, L2, A3._

## Universal rules (apply to every phase)

- **Source of truth:** code + `AUDIT_DECISIONS.md` + this file.
  `PROJECT_REQUIREMENTS.md` is a reference only — do NOT rewrite it.
- **Read first:** `README.md`, `AUDIT_DECISIONS.md`, `src/db/schema/`, the
  relevant `src/lib/` stub, and the relevant `src/app/` routes.
- **Data fetching (G8):** Server Actions for mutations; TanStack Query for
  client reads; React Server Components for initial/SSR reads.
- **UI:** shadcn/ui on Base UI; tokens from `src/app/globals.css`; the shared
  `Empty/Loading/Error` states; lucide icons; mobile-first; 44px touch targets;
  never color-alone status (SS17).
- **Authz:** capability-based via `can()`; enforce server-side — the client is
  defense-in-depth only.
- **Money flow (locked):** platform-captured, per-turf-owner
  `cancellation_policy`, weekly bKash payouts, settle-at-kickoff via Inngest.
- **Verify before marking a phase done:**
  `npm run lint && npm run typecheck && npm run build`, plus
  `npm run db:generate` if the schema changed. All must pass.
- **Decisions:** if a new product choice arises that isn't in
  `AUDIT_DECISIONS.md`, STOP and ask the user first (they prefer to discuss
  nuanced decisions in dialogue). Record the outcome in `AUDIT_DECISIONS.md`.
- **Commit:** one conventional commit per phase; update this checklist in the
  same commit; never push unless asked.
