# Turfkoi

> Book a turf. Find an opponent. Fill missing players. Play.
>
> A turf-booking + matchmaking platform built for Bangladesh: prices in
> Taka (BDT), payments via bKash, phone-first auth, map-based discovery.

This repository holds the product specs **and** the application. Phase 0
(Foundation) is complete; feature phases follow the roadmap below.

## Status

- **Specs:** `PROJECT_REQUIREMENTS.md` (technical blueprint), `AUDIT_DECISIONS.md`
  (locked decisions - 52 approved, 1 deferred), `DESIGN_REFERENCE.md` (visual
  language), `PROJECT_OVERVIEW.md` (plain-language summary).
- **Code:** Phase 0 foundation scaffolded - app shell, design tokens, full
  Drizzle schema, infra client stubs, CI. No feature logic yet.

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
| Auth | Auth.js (phone + OTP, JWT cookie) |
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

## Design system

Dark-first palette and tokens live in `src/app/globals.css`. Contrast audit:
`docs/CONTRAST_AUDIT.md`. Light mode is deferred to P1 (audit I2).

## Project structure

```
src/
  app/                # routes (server components by default)
    (public)/         # /, /turfs, /matches
    (auth)/           # /app, /team, /turf-owner, /admin (guarded in Phase 1)
  components/
    ui/               # shadcn/ui primitives (Base UI)
    shared/           # StatusBadge, BottomSheet, EmptyState, ...
    layout/           # header, footer, mobile nav
  db/
    schema/           # full Drizzle schema (all tables + audit additions)
    geo.ts            # PostGIS geography custom type
  lib/                # auth, db, payment, realtime, ratelimit, geo, ...
drizzle/              # generated migrations
.github/workflows/    # CI
```

## Roadmap (audit-approved MVP)

| Phase | Scope |
|---|---|
| **0. Foundation** (done) | Scaffold, tokens, schema, shell, CI |
| 1. Auth & users | Phone + OTP (mock), roles, RBAC, protected routes |
| 2. Turf management | Turf CRUD, PostGIS, slots, owner dashboard |
| 3. Booking & payments | Discovery, slot hold, bKash, money flow, payouts |
| 4. Team management | Team CRUD, members, dashboard |
| 5. Team matchmaking | Match state machine, find/accept opponent |
| 6. Player matchmaking | Find game, nearby matches, guest roster |
| 7. Admin | Approvals, payouts, disputes |
| 8. Production hardening | Threat model, audit immutability, DR, alerting |

See `AUDIT_DECISIONS.md` for the locked decisions behind each phase.

### Continuing the build

Progress is tracked in [`docs/PHASES.md`](docs/PHASES.md). To implement the next
undone phase in any fresh session (same machine or a different PC), run the
project command:

```
/next-phase
```

Or paste: `Read docs/PHASES.md and implement the next incomplete phase.` The
command reads the tracker, builds the next unfinished phase by the rules in that
file, ticks it off, and commits — so it works the same on any machine with the
repo cloned.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: env guard, lint,
typecheck, build, and `drizzle-kit check` (migration integrity).
