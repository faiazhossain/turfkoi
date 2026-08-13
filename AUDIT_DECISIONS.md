# Turfkoi — Audit Decisions Sheet

> **Purpose:** One decision per row. Approve / Reject / Defer each. This file does **not** replace `PROJECT_REQUIREMENTS.md` — it lists *what to change* and *what it changes*, so you can decide before I revise the spec.
>
> **Status legend:** `[ ] pending` · `[x] approved` · `[ ] rejected` · `[~] deferred`
>
> **Priority:** P0 blocker · P1 important · P2 later

---

## A. Strategic / Scope Decisions

| # | Suggestion | What it changes in PROJECT_REQUIREMENTS.md | Impact if approved | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| A1 | **Cut MVP ~35%.** Remove reviews, partial refunds, payment splitting, public team/match SEO pages, multi-owner turf, advanced admin analytics from MVP. | Rewrite §64 (MVP Definition). Move items to §65 Post-MVP. | Faster launch (≈10–12 wk instead of 4–6 mo). Less risk of running out of runway before reaching the matchmaking differentiator. | Approve | P0 | `[x]` |
| A2 | **Pick a launch wedge.** Team-first (recruit 5–10 existing team WhatsApp groups to seed real matches → "needs players" supply for solo joiners). | Add new §72 Cold-Start & Growth Plan. | Solves the empty-marketplace problem. Without this, the product launches with no value for solo players. | Approve team-first | P0 | `[x]` |
| A3 | **Add referral mechanic (P1).** "Invite your friends to join your team." | Add to §65 + §51 analytics. | Unlocks organic growth loop that fits BD football scene. | Approve (P1, not MVP) | P1 | `[x]` |
| A4 | **Define North Star + retention KPIs.** North Star = matches/week. Add D7/D30 retention, match-fill rate, opponent-match latency. | Expand §51 Analytics. | You cannot tell if the product is healthy without these. | Approve | P0 | `[x]` |

---

## B. Money Flow Decisions (highest-risk gaps)

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| B1 | **Write a cancellation policy.** Who can cancel, by when, refund %, what happens to the platform fee, what happens if Team B already paid. | Add new §70 Cancellation & Refund Policy. Update §27 booking lifecycle + §62 edge cases. | Prevents the #1 source of post-launch disputes. Currently undefined. | Approve | P0 | `[x]` |
| B2 | **Write a refund policy.** Auto vs manual triggers, timing, full-only in MVP (no partial). | Same as B1. | QA cannot test refunds without this. | Approve | P0 | `[x]` |
| B3 | **Define turf-owner payout schedule.** MVP = manual bKash send-money, weekly, admin-triggered. Add `payouts` table. | New §70 + new table in §37 + new admin screen in §35. | Turf owners are the entire supply side. No payout plan = no reason to stay. Critical. | Approve | P0 | `[x]` |
| B4 | **Write dispute resolution policy.** SLA, evidence model, admin decision set (refund X% / reject / reinstate), two-step approval for refunds > ৳5,000. | New §71 Dispute Resolution. Update §35 admin + §39 security. | Disputes exist in the state machine but cannot be resolved. | Approve | P0 | `[x]` |
| B5 | **Defer payment splitting (Team A + Team B) to P1.** MVP = single payer (booker) only. Bookers settle splits offline. | Mark §30 entirely as [P1]. | Removes significant booking atomicity complexity from MVP. | Approve | P0 | `[x]` |
| B6 | **Defer Nagad to P1.** MVP = bKash only. | Update §29, §56, §58. | Halves payment-integration risk for launch. | Approve | P0 | `[x]` |

---

## C. State Machine / Flow Contradictions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| C1 | **Reconcile §23 vs §68.** §23 state machine says pay → then build roster. §68 flow diagram says find players → then pay. They contradict. Adopt §23 (pay after opponent commit, before roster build). | Rewrite §68 Final System Flow to match §23. | Removes a fundamental ambiguity affecting BA, UX, and backend. | Approve | P0 | `[x]` |
| C2 | **Clarify booking state vs match state authority.** Two parallel state machines (booking + match) both have PAYMENT_PENDING → CONFIRMED. Define which is source of truth for user-facing status. | Add a subsection in §27 + §23. | Prevents "booking confirmed but match still pending" UX bugs. | Approve | P0 | `[x]` |

---

## D. Authentication Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| D1 | **Add phone + OTP as primary auth.** Email/password optional fallback. | Update §5 User Roles, §39 Security, §41 API, §58 env (OTP provider key). | BD users overwhelmingly prefer phone. Email-only will suppress activation. | Approve | P0 | `[x]` |
| D2 | **OTP brute-force protection.** 6-digit, 5-attempt lockout, 60s resend, per-phone rate limit. | Add to §39 + threat model §73. | OTP without rate limiting is trivially abusable. | Approve | P0 | `[x]` |

---

## E. UX / Onboarding Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| E1 | **Add onboarding flow.** First-run: role selection, profile completion prompts, empty-state coaching. | New subsection in §8 + §15. | Currently the doc has no answer to "user signed up — now what?" | Approve | P0 | `[x]` |
| E2 | **Add team/turf context switcher UX.** Users owning 2+ teams or turfs need a picker. | Add to §19 + §26 + component inventory §12. | Multi-team/multi-turf users otherwise get stuck in one context. | Approve | P1 | `[x]` |
| E3 | **Add match-day UX.** Pre-match card ("your match in 30 min"), roster attendance, directions. | New subsection in §18/§8. | "Play tonight" promise falls flat without match-day coordination. | Approve | P1 | `[x]` |
| E4 | **Add payment-failure recovery screen.** Explicit "did your payment fail? retry" pattern for bKash redirect failures. | Add to §15 UI states + §28 booking flow. | bKash redirects confuse users constantly; this is the difference between lost bookings and recovered ones. | Approve | P0 | `[x]` |

---

## F. Data Model Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| F1 | **Add match score/result fields.** `home_score`, `away_score`, `result_status` (pending/confirmed/disputed), `submitted_by`, `submitted_at`. | Add to §37 `matches` table. | Match completion is in the state machine but has no fields to store the result. | Approve | P0 | `[x]` |
| F2 | **Add player match history in MVP.** List of matches played, "I played" confirmation step. | Move from §34 Future into §64 MVP. | Without this the player-side retention loop is open. Not gamification — just history. | Approve | P0 | `[x]` |
| F3 | **Add `slot_holds` table.** Separate from bookings; carries TTL. | Update §27 + §37 + §38. | Cleaner than overloading booking status; solves the hold-vs-booked race. | Approve | P0 | `[x]` |
| F4 | **Add `cancellations` table.** `(booking_id, cancelled_by, reason, at)`. | New table in §37. | Required for refund audit + dispute resolution. | Approve | P0 | `[x]` |
| F5 | **Add `payouts` table.** `(turf_owner_id, amount, period, status, provider_ref)`. | New table in §37. | Required even if payouts are manual in MVP — model the flow now. | Approve | P0 | `[x]` |
| F6 | **Drop `teams.owner_id` denorm OR document its trigger.** Currently ownership lives in both `teams.owner_id` and `team_members(role=owner)` — dual source of truth. | Decide one in §37. | Prevents ownership drift bugs. | Approve (keep `team_members` only) | P1 | `[x]` |
| F7 | **Round player coords at write time, not read time.** 3 decimal places ≈ 110m. | Specify in §32 + §37 + §40. | Read-time rounding is a privacy leak waiting to happen. | Approve | P0 | `[x]` |
| F8 | **Specify turf_slot PK and status enum.** PK = `(turf_id, date, start_time)`. Status = `available / held / booked / maintenance / blocked`. | Tighten §37. | "PK-ish" is unbuildable. | Approve | P0 | `[x]` |

---

## G. Technical Provider Decisions (blockers — must pick)

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| G1 | **DB provider: Neon** (PostGIS supported, pooled + direct natively, branching for preview). | Resolve the unchecked item in §66. Update §56, §58. | Cannot start development without this. | Approve | P0 | `[x]` |
| G2 | **ORM / migrations: Drizzle** (PostGIS-friendly, SQL-first). | Add to §42 + §55. | Doc lists migrations as PR-reviewed but no tool chosen. | Approve | P0 | `[x]` |
| G3 | **Background jobs: Inngest** (Vercel-native, durable). | Update §49 + §56 + §57. | Slot expiry, payouts, notification dispatch all need this. | Approve | P0 | `[x]` |
| G4 | **Realtime: Pusher** (simplest for MVP; Ably if scale needed later). | Update §49 + §56 + §58. | Each provider has different pricing/fanout — must pick. | Approve | P0 | `[x]` |
| G5 | **Rate-limit + cache store: Upstash Redis.** | Update §39 + §56. | Rate limiting on serverless requires a shared store. Currently effectively absent. | Approve | P0 | `[x]` |
| G6 | **Analytics: PostHog** (covers funnel + retention). | Update §51 + §56. | Plausible lacks retention/funnel depth. | Approve | P1 | `[x]` |
| G7 | **Form library: react-hook-form + zod.** | Add to §42 + §45. | Currently unspecified. | Approve | P1 | `[x]` |
| G8 | **State clearly when to use Server Actions vs TanStack Query.** Server Actions for mutations; TanStack Query for client-reads; server components for initial reads. | Add to §42. | Prevents pattern sprawl. | Approve | P1 | `[x]` |

---

## H. Security Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| H1 | **Add a threat model section.** STRIDE or similar, one-pager. | New §73. | Principles are right in §39 but not operationalized. | Approve | P0 | `[x]` |
| H2 | **Audit log immutability.** INSERT-only DB role on `audit_logs`. | Update §37 + §59 + §39. | A mutable audit log is security theater. | Approve | P0 | `[x]` |
| H3 | **Webhook IP allowlist + signature** for bKash (and Nagad in P1). | Update §29 + §39. | Signature alone is not enough; provider source IPs must be allowlisted. | Approve | P0 | `[x]` |
| H4 | **Admin dual-control on refunds > ৳5,000.** | Update §35 + §39. | Refund abuse is a top fraud vector. | Approve | P1 | `[x]` |
| H5 | **Magic-byte file validation** (not extension-only). | Update §39. | Extension checks are trivially bypassed. | Approve | P1 | `[x]` |
| H6 | **Structured logger with PII redactor.** Convention "no PII in logs" is not enough. | Update §39 + §52. | Enforced redaction prevents accidental leaks. | Approve | P1 | `[x]` |

---

## I. UI / Design Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| I1 | **Run contrast audit on §11 palette** before freeze. Likely failures: `muted #8B95A5` on `card #11161D`. | Block §66 sign-off until audit passes. | WCAG AA is a stated target; current palette may fail it. | Approve | P0 | `[x]` |
| I2 | **Decide light mode: in MVP or deferred.** | Add to §11. | Dark-only is a real outdoor-usability risk in BD sunlight. | Deferred to P1 (decided): dark-only MVP, light mode post-MVP | P1 | `[~]` |
| I3 | **Add tone-of-voice + empty-state copy guidelines.** | Add to §11 + §15. | Trust in money flows depends on copy, not just visuals. | Approve | P1 | `[x]` |

---

## J. Performance / QA Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| J1 | **Add backend performance targets.** p95 < 300ms read APIs, < 800ms booking/payment initiation, < 5s webhook end-to-end. | Add to §47. | Frontend targets exist; backend has none. | Approve | P1 | `[x]` |
| J2 | **Specify transaction isolation level** for booking critical path (`READ COMMITTED` + `SELECT … FOR UPDATE`). | Add to §27 + §38. | Doc names the lock but not the isolation; this is the difference between safe and racy. | Approve | P0 | `[x]` |
| J3 | **Specify idempotency-key source** for booking creation. Client-generated UUID. | Add to §27 + §41. | Determines retry behavior. | Approve | P0 | `[x]` |
| J4 | **Map clustering on mobile** (cluster pins > 50; lazy-load MapLibre). | Add to §32 + §47. | Mobile map with many pins = jank. | Approve | P1 | `[x]` |
| J5 | **Negative E2E tests.** Abandon payment, cancel, dispute — not just the happy path. | Update §54. | Currently only happy-path E2E listed. | Approve | P1 | `[x]` |

---

## K. Operational / DevOps Decisions

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| K1 | **Define backup RPO/RTO + run a restore drill before launch.** | Update §56. | "Backups" alone is not a DR plan. | Approve | P0 | `[x]` |
| K2 | **Alerting thresholds.** 5xx rate, p95 latency, payment-webhook failure rate, slot-expiry lag. | Add to §56. | Without this, you find out about breakage from users. | Approve | P1 | `[x]` |
| K3 | **Define account deletion workflow.** Soft → hard after grace period (specify length), which fields are anonymized (name, phone, email yes; hashed id in audit logs: keep). | Update §40 + §38 + new subsection. | Privacy compliance + stated in doc but not specified. | Approve | P0 | `[x]` |

---

## L. Documentation Hygiene

| # | Suggestion | What it changes | Impact | My rec | Priority | Status |
|---|---|---|---|---|---|---|
| L1 | **Add an Open Questions Register (§74)** tracking the unresolved items below until closed. | New section. | Prevents "ready for handoff" claims with loose ends. | Approve | P0 | `[x]` |
| L2 | **Re-run this audit's checklist before declaring dev-ready** after revisions. | Update §0 document status. | Catches regression. | Approve | P1 | `[x]` |

---

## OPEN QUESTIONS — ANSWERED (locked)

1. **Cancellation windows** — **Per-turf-owner-configurable**, not a single platform-wide window. Owner picks a template at turf setup: Flexible / Moderate (tiered) / Re-book-contingent / Strict. Platform default applied if unset. See MONEY FLOW MODEL below.
2. **Payout schedule** — **Weekly, on-request, admin-triggered manual bKash** (per B3). Settlement keyed to "slot happened" so it doubles as the escrow.
3. **Phone OTP provider** — **Mock OTP during development now.** Integrate a BD SMS gateway (SSL Wireless / Metoa / GreenWeb) before the auth launch milestone. Reference + integration notes kept for future implementation.
4. **Launch wedge** — **Hybrid.** Platform concierge-onboards turfs (admin lists on behalf of turf owners); teams and players self-serve; signup open to all roles.
5. **Slot length** — **Owner-configurable (60 / 90 min).**
6. **Light mode** — **Deferred to P1** (dark-only MVP). See row I2.
7. **Roster limits** — **Configurable per format; tunable.** Defaults: 5v5 = 5 starters + 3 subs (min 5 to play); 7v7 = 7 + 4 subs (min 7 to play).
8. **Payment split** — **Deferred to P1.** MVP = single payer (booker).
9. **DB provider** — **Neon** (Postgres + PostGIS).
10. **Migration tool** — **Drizzle.**
11. **Slot hold TTL** — **10 minutes** (Phase 3). §27 names "e.g., 10 min" as the hold window; adopted as the constant `SLOT_HOLD_TTL_MS`. Expired both via the `slot-hold-expire` Inngest job and a check-on-read fallback.
12. **Booking concurrency on neon-http** — the HTTP driver can't `SELECT … FOR UPDATE` in a transaction (J2). We satisfy J2's *intent* with three layered primitives instead: the partial unique index `bookings_active_unique` rejects a second active booking for the same slot; client-generated idempotency keys (J3) make creation safely retryable; conditional `UPDATE … WHERE status=…` transitions ensure only one webhook/hold/cancel wins a race. Safer on serverless than row-level locks and avoids introducing a second DB driver.
13. **Team invitations** — **Direct add by phone** (Phase 4). Captain enters a phone number; if the user has signed up, they're added to `team_members` immediately. If not, a `team_invitations` row is stored and fulfilled automatically on first signup via `findOrCreateUserByPhone`. No invite-link mechanism; A2's WhatsApp seeding happens via direct phone adds.

---

## MONEY FLOW MODEL (B1-B4, locked)

Two layers — platform owns the mechanics, turf owners own the rules.

**Platform-owned (fixed, same for everyone):**
- Booker pays the platform upfront (turf price + ~5% fee, fee capped ~Tk100). Platform holds the funds.
- Cancelling **re-opens the slot** automatically so it can be re-sold.
- A "settle at kickoff" background job (Inngest) reconciles each booking at kickoff time.
- **Weekly payout** to turf owners for slots that settled in their favor that week (played matches + late-cancelled-and-not-rebooked). This weekly settlement *is* the escrow — no separate system.
- **Admin dispute override** as the safety net (force-majeure, fraud). Dual-control on refunds > Tk5,000.

**Turf-owner-configured cancellation policy (varies per turf):**

| Template | Behavior |
|---|---|
| Flexible | Full refund anytime up to the owner-set cutoff. |
| Moderate (tiered) | e.g., full >24h, 50% within 2-24h, none <2h (owner-tunable). |
| Re-book-contingent | Full refund *only if* the slot gets re-booked before kickoff; otherwise turf keeps the payment. |
| Strict | No refunds. |

Owner picks a template + thresholds at turf setup; platform default applies if unset. The chosen policy is **surfaced to the booker before payment** (transparency). Platform enforces the owner's choice; admin can override on dispute.

---

## HOW TO USE THIS FILE

- For each row: change `[ ]` to `[x]` approve, `[ ] rejected`, or `[~] deferred`.
- Answer the 10 open questions at the bottom.
- When you're done, tell me which rows you approved — I'll produce a revised **v1.1** of `PROJECT_REQUIREMENTS.md` applying only those changes. Nothing else changes.

**Scope of revision will be exactly the approved rows — no surprises, no extra edits.**
