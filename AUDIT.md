# DeshiTurf — Full Project Audit

**Date:** 2026-08-27
**Scope:** Architecture, Security, Database, Performance, Product Quality (i18n, loading states, UX)
**Stack:** Next.js 16.3.3 · React 19.2.8 · TypeScript 5 · Drizzle ORM + Neon Postgres (PostGIS) · NextAuth 5 (beta) · TanStack Query · Zod 4 · MapLibre v6 · Pusher · bKash payments

---

## Executive Summary

**Overall verdict: Strong, production-shaped codebase with a few real risks.**

The foundations are genuinely good: capability-based authorization, Zod validation everywhere, DB-level double-booking prevention, idempotent payment confirmation, professional migrations, Bangla-first i18n discipline, and clean feature-based architecture. The biggest gaps are **performance for the target audience** (raw `<img>` tags + an un-split MapLibre bundle on a mobile-first Bangladeshi product) and a handful of **security hardening items** (session role freshness, OTP cleanup, password policy).

| Area | Score | One-liner |
|---|---|---|
| Architecture | 8.5/10 | Clean feature structure, some oversized files |
| Security | 7.5/10 | Mature patterns, needs webhook/role/OTP hardening |
| Database | 9/10 | Excellent constraints; missing explicit transactions |
| Performance | 5.5/10 | Biggest weakness — images, map bundle, zero caching |
| Product Quality (i18n/UX) | 8.5/10 | Near-perfect i18n, 1 hardcoded string found |

---

## 1. Architecture & Code Organization

### Strengths
- **Feature-based structure** — `src/features/*` (actions, queries, schemas per domain) with 13 schema files barrel-exported. 34 routes across `(auth)`, `(public)`, admin, owner, player areas.
- **Excellent server/client balance** — server components by default; TanStack Query (30s staleTime) for client server-state; Zustand only where justified.
- **Type safety throughout** — TypeScript everywhere, Drizzle typed queries, typed dictionaries (`bn.ts` is `typeof en`, so key drift fails typecheck).
- **23 test files** focused on critical paths; no dead code or TODO debt found.

### Issues
| Severity | Issue | Location |
|---|---|---|
| Medium | 538-line wizard component — hard to maintain/test | `src/components/turfs/slots-dashboard/schedule-wizard.tsx` |
| Medium | 480-line form component | `src/components/turfs/turf-form.tsx` |
| Medium | 440-line schedule builder form | `src/components/turfs/schedule-builder-form.tsx` |
| Medium | Bloated action files (583–701 lines each) | `src/features/turfs/actions.ts`, `bookings/actions.ts`, `admin/actions.ts` |
| Low | 399-line page component | `src/app/(auth)/turf-owner/turfs/[id]/page.tsx` |
| Low | 436-line inline SVG component | `src/components/home/soccer1-svg.tsx` (do not touch — HeroAnimation is protected by project rules) |
| Low | Env vars read directly in many files; no central config module | scattered |

---

## 2. Security

### Strengths (worth knowing — these are done right)
- Zod validation on every action; no raw SQL (Drizzle parameterized).
- Capability-based RBAC via `src/lib/capabilities.ts`; `getCurrentUser()` cached per request.
- Rate limiting (Upstash) on auth + bKash webhook; timing-safe webhook signature comparison.
- bKash webhook: signature + IP allowlist + **idempotent** confirm action, so duplicate/forged/replayed webhooks collapse to no-ops (`src/app/api/payments/bkash/webhook/route.ts`).
- bcrypt password hashing; OTP codes stored as SHA-256 hashes (not plaintext).
- Dual-control approval for refunds > ৳5,000.
- Image upload validation (format, size, authorization) with signed upload tokens.

### Findings
| Severity | Issue | Location | Why it matters |
|---|---|---|---|
| **High** | `requireAdmin()` checks roles from the JWT only, no fresh DB lookup | `src/features/admin/actions.ts:42-54` | If an admin is demoted/suspended, their token keeps full admin power until it expires. Revocation must be instant for admin actions. |
| **High** | OTP records never cleaned up after expiry | `src/features/auth/otp-service.ts:66-73` | Table grows forever; each expired OTP is residual attack/replay surface. Needs a scheduled purge. |
| **High** | Password policy is length-only (8–72), no complexity/common-password check | `src/features/auth/schemas.ts:22-23` | "password123" passes. On a phone-identity app this is the main brute-force surface. |
| Medium | Image signing endpoint has no rate limit (other sensitive endpoints do) | `src/app/api/images/sign/route.ts` | Flood → exhaust Cloudinary quota. |
| Medium | Dev mode skips webhook signature verification when signature is absent | `src/lib/payment.ts:186-195` | Fine for local dev, dangerous if `NODE_ENV` misconfigures in a deployed env. Guard tightly. |
| Medium | Admin self-action checks return distinct errors ("can't suspend yourself" vs "user not found") | `src/features/admin/actions.ts:324-354` | Enables admin-account enumeration. Return one generic error. |
| Low | Some dev-mode errors leak internal detail (constraint names etc.) | various | Ensure verbose errors can't reach production responses. |

---

## 3. Database & Data Layer

### Strengths
- **Double-booking prevented at DB level**: `bookings_active_unique` partial unique index + `turf_slots_no_overlap` EXCLUDE constraint with `tsrange`. This is the correct hard way — race conditions physically can't create conflicts.
- Idempotency keys on bookings/transactions for safe retries; conditional `UPDATE ... WHERE status = ...` guards state transitions (a sensible workaround for Neon's HTTP driver lacking interactive transactions).
- Money is `NUMERIC(12,2)` consistently — no float rounding bugs.
- Real Postgres enums for all statuses (9 booking states, 7 transaction states) — no magic strings.
- 14 clean, ordered migrations incl. custom SQL for PostGIS and EXCLUDE constraints.
- Privacy-aware: player coordinates rounded to ~110 m at write time; soft-delete for users; audit logs survive deletion.

### Findings
| Severity | Issue | Location | Why it matters |
|---|---|---|---|
| Medium | `initiatePaymentAction` does 3 steps (transaction insert → bKash call → booking update) with no transaction wrapper | `src/features/bookings/actions.ts` | A crash mid-sequence leaves a paid-but-unreflected or orphaned record. At minimum add a reconciliation sweep. |
| Medium | `cancelBookingAction` updates bookings + cancellations + slots + transactions without a wrapper | `src/features/bookings/actions.ts` | Same partial-failure risk. |
| Low | Consider composite indexes for hot query patterns (`user_id + status + date`) | schema | Becomes relevant at scale. |

---

## 4. Performance

This is the weakest area — and it matters most, because the target user is on a budget Android phone over a slow Bangladeshi mobile network.

### Findings
| Severity | Issue | Location | Why it matters |
|---|---|---|---|
| **Critical** | 8+ raw `<img>` tags, no `next/image` | `turf-card.tsx:37`, `turf-photo-gallery.tsx:85`, `turf-photo-strip.tsx:29,52`, `my-turf-card.tsx:44`, `team/[slug]/page.tsx:77`, `team-logo-field.tsx:48`, `avatar-field.tsx:42` | Turf photos are the product's storefront. Full-resolution Cloudinary images ship unoptimized, unresized, no modern formats. This is the single biggest user-perceived speed win available. |
| **High** | `next.config.ts` is empty — no Cloudinary image domains, no optimization config | `next.config.ts:3-5` | `next/image` can't be adopted without `images.remotePatterns`; currently the door is closed. |
| **High** | MapLibre (~200 KB+ gzipped JS) not code-split — loaded eagerly on pages with maps | `src/components/map/map-canvas.tsx`, `map-view.tsx`, `location-picker.tsx` (375 lines) | Users who never open a map still pay the cost. Needs `next/dynamic` with `ssr: false` + loading fallback (use approved `Loader`). |
| Medium | Zero caching strategy — no `revalidate`, no cache tags; every page hit hits the DB | various pages | Public pages (turf listing, turf detail) could be cached/revalidated per-turf instead of fully dynamic. |
| Medium | PostHog (JS + Node) and Pusher ship on every page | `package.json` | Verify PostHog is loaded lazily/after hydration so it never blocks first paint. |

### Strengths
- SQL is excellent: PostGIS `ST_DWithin` distance queries, single-query joins, no N+1 patterns found; pages use `Promise.all` for parallel fetches.
- Lucide icons imported individually (tree-shakeable); date-fns usage minimal.
- MapLibre v6 worker copy script (`postinstall`) is a correct, necessary workaround.

---

## 5. Product Quality — i18n, Loading States, UX

### Strengths
- i18n discipline is near-perfect: server actions return dictionary keys, `translateError()` handles legacy strings, `buildMetadata()` used across pages with localized OG metadata.
- Approved `Loader` component used consistently; Button `loading` prop (aria-busy + disabled) on all major flows — matches project mandate.
- `EmptyState` component used everywhere lists can be empty.
- Mobile-first responsive grids throughout; aria-labels on icon buttons; HTML autocomplete attributes on forms.

### Findings
| Severity | Issue | Location |
|---|---|---|
| Medium | Hardcoded English string `Closed` instead of `t("turfs.closed")` — the one i18n violation found | `src/components/bookings/book-slot-button.tsx:107` |
| Low | Inline field-level validation errors exist in team/turf forms but not consistently in all forms | mixed |
| Low | Some tertiary async buttons lack loading feedback (double-submit risk) | mixed |

---

## 6. Dependencies & Versions

| Item | Status | Note |
|---|---|---|
| Next.js 16.3.3 / React 19.2.8 | ⚠️ Watch | Bleeding-edge; the repo itself warns APIs differ from common knowledge. Pin and test before any bump. |
| NextAuth 5.0 **beta-32** | ⚠️ Watch | Beta auth in production is a standing risk; track release notes. |
| MapLibre 6.5.0 | OK | Latest; worker workaround in place. |
| motion 13.1.0 | OK | Heavy but confined to hero/landing (protected by design rules). |
| Unused deps | None found | Clean. |

---

## 7. Priority Fix List (ordered)

1. **Adopt `next/image` + configure `images.remotePatterns` for Cloudinary** — convert the 8 raw `<img>` sites. Biggest speed win for the actual audience.
2. **Code-split MapLibre** with `next/dynamic` (`ssr: false`) + approved Loader fallback.
3. **Fresh DB role check in `requireAdmin()`** — revocation must be instant.
4. **OTP expiry cleanup job** (scheduled delete of expired rows).
5. **Stronger password policy** (common-password blocklist + min complexity).
6. **Fix hardcoded `Closed` string** → `t("turfs.closed")`.
7. **Add rate limiting to `/api/images/sign`**.
8. **Payment/cancel flows**: add reconciliation sweep (or transactions if the Neon driver gains support).
9. **Cache public turf pages** (`revalidate` + per-turf tags).
10. **Split the 4 oversized components / 3 oversized action files** (maintainability, not urgency).

---

## 8. Easy-to-Understand Summary (with explanations)

Think of the app as a shop. Here's what the audit found, in plain language:

### 🚦 Fix first (users feel these)

1. **Your photos are being delivered at full size ("raw `<img>` tags").**
   *Why it's needed:* Imagine printing a poster and mailing it to someone who only asked for a stamp-sized photo. Every turf photo downloads at original size even on a tiny phone screen. On Bangladeshi mobile networks this makes the app feel slow and eats users' data. Next.js has a built-in tool (`next/image`) that automatically shrinks photos to fit each screen — it just needs to be switched on and configured for your photo host (Cloudinary). This is the #1 speed fix.

2. **The map library loads for everyone, even people who never open a map.**
   *Why it's needed:* MapLibre is like carrying a heavy toolbox everywhere you go just in case you need a hammer. Only the location-picker pages need it. "Code-splitting" means the map code is downloaded only when someone actually opens a map page. Everyone else's first load gets lighter and faster.

3. **Admin powers don't switch off instantly.**
   *Why it's needed:* When an admin logs in, they get a "badge" (token) that says "I'm admin." Right now the app trusts that badge until it expires — it doesn't double-check with the database. If you ever need to remove an admin urgently, they could keep admin access for hours. Checking the database each time means the moment you demote someone, their power is gone. For a payments app this matters.

### 🔐 Security hygiene (cheap insurance)

4. **Old OTP codes pile up forever.**
   *Why it's needed:* Every SMS code ever sent stays in the database even after expiring. It's like never throwing away used scratch cards — mostly clutter, but each one is a tiny unnecessary risk. A scheduled cleanup job deletes them.

5. **Weak passwords are accepted ("password123" passes).**
   *Why it's needed:* Your users log in with phone numbers, so the password is the only lock on the door. Making passwords reject common/guessable ones is one line of defense that stops most break-in attempts before they start.

6. **The image-upload-token endpoint has no "queue line" (rate limit).**
   *Why it's needed:* Other sensitive doors in your app have guards that stop someone from hammering them thousands of times per minute. This one doesn't. Adding the same guard prevents abuse of your Cloudinary quota (which can cost money).

### 💸 Money-flow safety

7. **Payment steps aren't wrapped in a single "all-or-nothing" operation.**
   *Why it's needed:* When a payment happens, the app does 3 things: record the transaction, call bKash, update the booking. If the server crashes between step 2 and 3, the money moved but the booking doesn't reflect it — and a human has to untangle it. Your database setup makes true transactions awkward, so the practical fix is a **reconciliation job**: a background check that finds half-finished payments and completes/corrects them automatically. (Good news: your booking logic already prevents double-booking *at the database level*, which many production apps get wrong — this is a genuinely strong part of the codebase.)

### 🏷️ Small but should be fixed

8. **One English word ("Closed") is hardcoded in the booking calendar.**
   *Why it's needed:* Your product is Bangla-first. Everything else flows through the translation system, so English users also can't get "Closed" in... anything. It's a one-line fix to route it through the dictionary like everything else.

9. **Public pages re-fetch everything from the database on every visit.**
   *Why it's needed:* A turf's photos, description, and price don't change every second, but the app rebuilds that page from scratch for every visitor. Caching lets the page be reused for a short time — less database work, faster pages, cheaper at scale. (Skip this for logged-in dashboards; those should stay personal and fresh.)

### 🧹 Housekeeping (not urgent)

10. **A few files have grown too big (500–700 lines).**
    *Why it's needed:* Big files aren't a bug — but they're slow to change safely and hard to test. Splitting the turf form, schedule wizard, and the three big "actions" files makes future features faster to build and less likely to break something nearby. Do this gradually, whenever you're already touching those files.

### ✅ What's already excellent (don't break these)

- **Double-booking is impossible at the database level** — two users can never grab the same slot even if they tap at the same millisecond.
- **Payment confirmation is idempotent** — if bKash sends the same "payment done" message twice, nothing breaks; it's safely ignored.
- **Bangla-first discipline** — near-total dictionary coverage, typed translations that fail the build if Bangla and English drift apart.
- **Money stored as exact decimals** — no rounding bugs that could leak taka over thousands of bookings.
- **Privacy-aware location storage** — player coordinates are blurred to ~110 m, so you can match players by area without tracking anyone's home.

---

*Audit performed by Claude Code with five parallel deep-dive agents; high-impact claims (image usage, next.config, webhook verification, hardcoded string) were manually verified against source.*
