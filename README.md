# Turfkoi

> Book a turf. Find an opponent. Fill missing players. Play.
>
> A turf-booking + matchmaking platform built for Bangladesh: prices in
> Taka (BDT), payments via bKash, phone-first auth, map-based discovery.

This repository holds the product specs **and** the application. The full MVP
build is complete.

## Status

- **Specs:** `PROJECT_REQUIREMENTS.md` (technical blueprint), `AUDIT_DECISIONS.md`
  (locked decisions - 52 approved, 1 deferred), `DESIGN_REFERENCE.md` (visual
  language), `PROJECT_OVERVIEW.md` (plain-language summary).
- **Code:** full MVP shipped — auth, turfs, bookings + money flow, teams,
  matchmaking (team + player), admin oversight, and production hardening.
- **Features:** see [`docs/FEATURES.md`](docs/FEATURES.md).

## Tech stack

| Concern | Choice |
|---|---|
| App | Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui (Base UI) |
| State/forms | TanStack Query, Zustand (minimal), react-hook-form + zod |
| Motion/icons | Framer Motion (`motion`), lucide-react |
| Database | Neon (Postgres + PostGIS), Drizzle ORM + drizzle-kit |
| Background jobs | Inngest |
| Realtime | Pusher |
| Rate limit / cache | Upstash Redis |
| Analytics | PostHog (P1) |
| Auth | Auth.js (phone/email + bcrypt password, email OTP for registration + reset, JWT cookie) |
| Payments | bKash (MVP) |
| Deploy | Vercel |

## Getting started

```bash
npm install
cp .env.example .env       # fill in values (DATABASE_URL etc.)
npm run dev
```

Node 22 (see `.nvmrc`). Package manager: npm.

### Database (Neon + PostGIS)

1. Create a Neon project, enable the PostGIS extension **once**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
2. Put the **pooled** connection string in `DATABASE_URL` and the **direct**
   (non-pooled) string in `DATABASE_DIRECT_URL`.
3. Generate and apply migrations:
   ```bash
   npm run db:generate      # create migration SQL from schema
   npm run db:push          # push schema to the DB (dev)
   # or: npm run db:migrate # apply versioned migrations
   npm run db:studio        # open Drizzle Studio
   ```

> GiST spatial indexes on geography columns are not expressed by Drizzle and
> must be added via raw SQL after the first migration.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:env` | Guard against `NEXT_PUBLIC_` secret leaks |
| `npm run db:generate` | Generate Drizzle migration |
| `npm run db:push` / `db:migrate` | Apply schema to DB |
| `npm run db:studio` | Drizzle Studio GUI |
| `npm test` | Run the vitest suite (negative-path tests) |

## Design system

Dark-first palette and tokens live in `src/app/globals.css`. Contrast audit:
`docs/CONTRAST_AUDIT.md`. Light mode is deferred to P1 (audit I2).

## Project structure

```
src/
  app/                # routes (server components by default)
    (public)/         # /, /turfs, /matches, /invite/[code]
    (auth)/           # /app, /team, /turf-owner, /admin (guarded)
  components/
    ui/               # shadcn/ui primitives (Base UI)
    shared/           # StatusBadge, BottomSheet, EmptyState, ...
    layout/           # header, footer, mobile nav
  db/
    schema/           # full Drizzle schema (26 tables + 19 enums)
    geo.ts            # PostGIS geography custom type
  features/           # per-domain actions / queries / schemas
  lib/                # auth, db, payment, realtime, ratelimit, geo, logger, ...
drizzle/              # generated migrations + audit-role.sql
.github/workflows/    # CI
```

## Features (high level)

- **Player** — registration with email verification + password auth,
  availability toggle, nearby matches, match history, referral invite link,
  account deletion.
- **Team** — CRUD, phone-based invites, multi-team switcher, internal roles.
- **Turf owner** — turf CRUD with PostGIS + R2 photo upload, slot generation,
  per-turf-owner cancellation policy, owner dashboard with "Fill This Slot".
- **Matchmaking** — team (pay-then-roster state machine) + player (geo-sorted
  nearby matches, join requests, guest roster).
- **Booking & money flow** — 10-min slot holds, bKash-only payments (webhook
  signature **and** IP allowlist), settle-at-kickoff, weekly admin-triggered
  bKash payouts.
- **Admin** — KPI overview, user/turf/team/booking/match/transaction
  management, payouts, **dual-control refunds > Tk5,000**, dispute resolution,
  reports.
- **Production hardening** — threat model, INSERT-only audit role, magic-byte
  file validation, PII-redacting structured logger, account deletion workflow,
  perf targets, DR + alerting runbooks, vitest negative tests, SEO sitemap +
  robots, contrast/a11y re-audit.

Full per-role breakdown: [`docs/FEATURES.md`](docs/FEATURES.md).

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: env guard, lint,
typecheck, build, and `drizzle-kit check` (migration integrity).
