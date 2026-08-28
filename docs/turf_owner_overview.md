# Turf Owner — Area Overview

Developer reference for everything in the DeshiTurf **turf owner** area: routes, feature modules, components, database schema, onboarding flows, and the slot scheduling engine.

---

## 1. Routes & Pages

### Owner Dashboard — `src/app/(auth)/turf-owner/page.tsx`
Owner's landing page after login. Requires an authenticated session with the `turf_owner` role (unauthenticated users are redirected to `/login`).

- KPI cards: today's revenue, upcoming bookings, available slots, occupancy %
- Turf inventory list (cover photo, name, location, format, verification badge) via `MyTurfCard`
- "Fill This Slot" section: upcoming empty slots to promote (`listOwnerFillableSlots`)
- Entry point to `/turf-owner/turfs/new`

### New Turf — `src/app/(auth)/turf-owner/turfs/new/page.tsx`
Renders `TurfForm` in create mode: name, slug (auto-generated), coordinates, format, location, facilities, cancellation policy. Submits `createTurfAction`.

### Manage Turf — `src/app/(auth)/turf-owner/turfs/[id]/page.tsx`
Full management interface for one turf. Authorization via `can(user, "turf.update", { ownerId: turf.ownerId })`; returns 404 when unauthorized. Two tabs:

- **Details** — `TurfForm` (edit) + photo gallery
- **Slots** — weekly schedule builder, booking horizon select, server-driven calendar (`?month=` / `?date=` params), day panel for exceptions/manual slots, saved schedules card, conflict list

### Public Application — `src/app/own-a-turf/page.tsx`
Public "list my turf" form (`TurfApplicationForm`), **no authentication required**. Rate-limited (5/hour per IP).

---

## 2. Feature Modules

### `src/features/turfs/` — core turf management

#### Server actions (`actions.ts`)

| Action | Purpose | Notes |
|---|---|---|
| `createTurfAction(input)` | Create turf owned by current user | Requires `turf.update`; unique slug; returns `{ ok, id }` |
| `updateTurfAction(turfId, input)` | Update turf details | Ownership check; revalidates public page |
| `generateSlotsAction(turfId, input)` | Bulk-generate slots from date range × weekdays × time windows | `onConflictDoNothing` → idempotent; returns inserted count |
| `updateSlotAction(turfId, date, startTime, input)` | Edit single slot price/status | Can't touch booked/held; sets `source=manual` |
| `deleteSlotAction(turfId, date, startTime)` | Delete a slot | Only `status=available` rows |
| `saveScheduleAction(turfId, input)` | Create/update weekly schedule | Deactivates other schedules; materializes 30 days on activation |
| `updateBookingHorizonAction(turfId, days)` | Set booking horizon (7/14/30/60/90) | Re-materializes immediately (fill or trim) |
| `addSlotAction(turfId, input)` | Hand-place one custom slot | Overlap-checked incl. midnight spill; `source=manual` |
| `setDateExceptionAction(turfId, input)` | Close a date or set holiday pricing | Closed dates can't carry price rules; re-materializes |
| `clearDateExceptionAction(turfId, input)` | Remove date exception | Re-materializes to restore normal slots |
| `activateScheduleAction(turfId, input)` | Activate saved schedule, optional effective window | Seasonal switching ("Ramadan hours"); returns materialization summary |

Error values returned from actions are **dictionary keys** rendered via `t(res.error ?? "errors.generic")` (see `AGENTS.md` i18n rules).

#### Queries (`queries.ts`)

- `listTurfs(filter)` — public discovery; PostGIS `ST_DWithin` radius, area/format/verification filters
- `listTurfAreas()` — distinct areas with verified+active+located turfs
- `getTurfBySlug(slug)` / `getTurfById(id)` — single lookups
- `listTurfPhotos(turfId)` — gallery, cover first
- `getTurfLatLng(id)` — lat/lng via `ST_Y`/`ST_X`
- `listMyTurfs(ownerId)` — owner inventory with cover photos
- `listTurfSlots(turfId, range)` — slots for a date range
- `listUpcomingEmptySlots(turfId, days)` / `listOwnerFillableSlots(ownerId, days)` — "Fill This Slot"
- `getOwnerKPIs(ownerId)` — today revenue/bookings, next-7-day bookings, available slots, occupancy % (booked / (booked+available) over next 7 days)

#### Schemas (`schemas.ts`)
Zod: `turfFormSchema`, `generateSlotsSchema` (30–180 min slots, multiples of 5), `scheduleSectionSchema`, `saveScheduleSchema`, `addSlotSchema`, `dateExceptionSchema`, `activateScheduleSchema`, and `BOOKING_HORIZON_CHOICES = [7, 14, 30, 60, 90]`.

### `src/features/turf-applications/` — public onboarding applications

| Action | Purpose |
|---|---|
| `submitTurfApplicationAction(input)` | Public submit (no auth); rate-limited 5/h/IP; notifies all admins |
| `approveTurfApplicationAction(input)` | Admin-only; seeds unverified/unowned turf; notifies applicant if account exists |
| `rejectTurfApplicationAction(input)` | Admin-only; keeps row for audit; notifies applicant |

Queries: `listTurfApplications(filter)`, `countPendingApplications()` (admin badge).

### `src/features/turf-claims/` — claim invites & owner onboarding

| Action | Purpose |
|---|---|
| `seedTurfAction(input)` | Admin creates basic turf: `ownerId NULL`, unverified (invisible publicly until claimed) |
| `createClaimInviteAction(input)` | Admin mints single-use claim link; revokes previous invite; optional OTP for WhatsApp login; emails link when target email given |
| `claimTurfAction(token)` | Atomic ownership flip via conditional WHERE; grants `turf_owner`; consumes invite; 10/5min rate limit |
| `claimOtpLoginAction(token, code)` | WhatsApp-OTP first login — joint proof of link + 6-digit code; finds/creates account, rotates one-time password, signs in |
| `setClaimPasswordAction(password)` | Owner sets password after OTP login |
| `skipClaimPasswordAction()` | Generates + saves a simple password, returns it for display |

Supporting modules:

- **`invites.ts`** — 43-char base64url tokens (32-byte entropy), sha256-hashed at rest, optional 6-digit OTP (5 attempts, 15-min lock), 14-day TTL, terminal states: `invalid | expired | claimed | revoked | turf_claimed`
- **`owner-account.ts`** — `findOrCreateOwnerByPhone()` (rotates password, attaches email only when free, grants baseline `player` role), `generateSimplePassword()` (e.g. `kex-mol-far`)
- **`constants.ts`** — `CLAIM_INVITE_TTL_DAYS = 14`, `CLAIM_COOKIE = "deshiturf_claim"`

### `src/features/owner-login/` — admin-issued support codes

| Action | Purpose |
|---|---|
| `mintOwnerLoginCodeAction(input)` | Admin generates a WhatsApp sign-in code (optional password lock for compromised accounts) |
| `ownerCodeLoginAction(input)` | Owner signs in with phone + 6-digit code; rotates one-time password; forced password change after |

Codes are sha256-hashed, 15-minute TTL, 5 attempts / 15-min lock, single use, previous code revoked on re-mint.

---

## 3. Owner-Facing Components

| Component | Purpose |
|---|---|
| `src/components/turfs/turf-form.tsx` | Create/edit turf: fields, facility presets + up to 12 custom facilities, cancellation policies (flexible/moderate/rebook_contingent/strict), map location picker; RHF + Zod |
| `src/components/turfs/schedule-builder-form.tsx` | Weekly schedule editor: per-weekday sections, live slot preview (same expander as server), overlap/wrap conflict detection, copy-day, durations 30–180 min, gaps 0–30 min, materialization summary on save |
| `src/components/turfs/saved-schedules-card.tsx` | Saved schedule list, activate/deactivate with optional effective window (Ramadan window pre-seeded) |
| `src/components/turfs/slots-dashboard/booking-horizon-select.tsx` | Horizon picker (7/14/30/60/90); saves on change with materialization impact summary |
| `src/components/turfs/slots-dashboard/day-panel.tsx` | Selected-day editor (desktop inline card / mobile bottom sheet): slot list, close/price-rule exception form, empty-state explanations |
| `src/components/turfs/turf-booking-calendar.tsx` | Month calendar, day status colors (open/full/closed); server-driven via `?month=`; owner mode = block/unblock instead of booking |
| `src/components/turfs/my-turf-card.tsx` | Dashboard turf card with cover photo + verification badge → manage page |
| `src/components/turfs/add-slot-form.tsx` | Hand-place single custom slot; date prefilled from calendar |
| `src/components/turf-applications/turf-application-form.tsx` | Public application form (turf name, contact, WhatsApp phone required, optional coords) |

---

## 4. Database Schema

All under `src/db/schema/`.

### `turfs.ts`
- **turfs** — `id`, `slug` (unique), `name`, `ownerId` (nullable → unclaimed), `coords` (PostGIS geography), `format` (fives…elevens), `city/area/address`, `description`, `facilities` (jsonb), `isVerified`, `isActive`, `cancellationPolicy` + config (jsonb), `bookingHorizonDays` (default 30)
- **turf_schedules** — weekly schedules; partial unique index: exactly one `isActive` per turf; optional `effectiveFrom`/`effectiveTo` window for seasonal schedules
- **turf_schedule_sections** — `dayOfWeek` (0=Sun…6=Sat), optional label, `startTime`/`endTime` (end ≤ start wraps past midnight), `slotMinutes` (30–180), `gapMinutes`, `price`
- **turf_date_exceptions** — one per turf per date (unique); `isClosed` suppresses all slots; or price rule (`priceMode`: multiplier/absolute, `priceValue`), optional owner-facing `reason`
- **turf_slots** — composite PK `(turfId, date, startTime)`; `durationMinutes`, `status` (available/held/booked/maintenance/blocked), `price`, `source` (template/manual), `scheduleId` lineage, generated `slotRange` tsrange column backing the DB overlap guard

### `turf-applications.ts`
`turfName`, `contactName`, `phone` (required), optional email/city/area/address/notes/coords, `status` (pending/approved/rejected), `submittedBy`, `turfId` (set on approval), `reviewedBy/At`.

### `turf-claims.ts`
Single-use invites: `tokenHash`, optional `targetEmail`/`targetPhone` (+880 normalized), `otpHash` + `otpAttempts` + `otpLockedUntil` + `otpConsumedAt`, `invitedBy`, `expiresAt` (14 days), `claimedAt`/`claimedBy`, `revokedAt`. Partial unique index: one active (unclaimed, unrevoked) invite per turf.

### `owner-login-codes.ts`
`phone`, `codeHash`, `attempts`, `lockedUntil`, `consumedAt`, `revokedAt`, `createdBy`, `expiresAt` (15 min).

### `bookings.ts`
`turfId`, `date`, frozen `slotStart`/`slotEnd`, `bookerId`, `status` (held → payment_pending → confirmed → …), `idempotencyKey` (unique, client-generated), `totalAmount`. Partial unique index: one active booking per `(turfId, date, slotStart)`.

### `users.ts`
`users` — phone-first accounts (`phone` unique), optional unique `email`, `passwordHash`, `status` (active/suspended/deleted).
`user_roles` — composite PK `(userId, role)`; enum: `admin | turf_owner | team_owner | player`.

---

## 5. Owner Onboarding Flows

### Flow A — Admin seeding + claim link
1. Admin creates turf via `seedTurfAction` (unowned, unverified)
2. Admin mints a claim invite (`createClaimInviteAction`) → link + optional OTP
3. Owner opens link (WhatsApp/email); optional OTP login (`claimOtpLoginAction`) creates/rotates the account
4. `claimTurfAction` transfers ownership, grants `turf_owner`, consumes invite
5. Owner completes the listing in the dashboard

### Flow B — Public application
1. Owner submits at `/own-a-turf` (no auth) → admins notified
2. Admin approves → unverified turf seeded from application data
3. Continues at Flow A step 2 (claim invite)

### Flow C — Admin support login
Owner locked out → admin mints 6-digit login code → owner signs in with phone + code → one-time password forces a password change.

---

## 6. Auth, Roles & Authorization

- **Middleware** (`src/auth.config.ts`): protects `/turf-owner` (among `/app`, `/team`, `/admin`); redirects unauthenticated → `/login`; role-based post-login homes (admin → `/admin`, turf owner → `/turf-owner`, else → `/app`)
- **Session**: JWT carries `id`, `phone`, `roles`; `getCurrentUser()` (`src/lib/auth.ts`) is the authoritative per-request lookup with fresh DB roles
- **Capabilities** (`src/lib/capabilities.ts`): `can(user, "turf.update", { ownerId })` — admins always pass; `turf_owner` passes only for own turfs
- Server actions return **dictionary keys** as errors, never English sentences (BN-first rule)

---

## 7. Slot Scheduling Engine

### Three-layer precedence
1. **Manual slots** — owner's hand-placed/edited slots; never touched by regeneration
2. **Date exceptions** — per-date closures or price rules (incl. BD holidays / Ramadan presets from `src/lib/bd-holidays.ts`)
3. **Active weekly schedule** — base template sections

### Materialization (`src/features/turfs/materialize.ts` + `src/lib/slot-planning.ts`)
`materializeTurfSchedule(turfId, range?)` reconciles *desired* slots (schedule + exceptions, within booking horizon) vs *existing* rows.

**Safety contract** — only mutates rows where `status = 'available' AND source = 'template'`. `booked`/`held` (booking lifecycle), `manual`, `maintenance`, `blocked` are kept untouched. Sequence: deletes → updates → inserts, each re-asserting the safety predicate in `WHERE`.

Returns counts (inserted/updated/deleted) plus **conflicts** the materializer refused to resolve; `listSlotConflicts(turfId)` surfaces them for the UI:

- `insert_overlap` — planned slot would overlap a kept slot
- `kept_duration` — kept slot's duration differs from plan
- `resize_overlap` — duration change would overlap a kept slot
- `outside_plan` — kept slot not in the active plan

Overlap is guarded at both levels: application-level checks (incl. midnight-spill via `spillOverlap`) and a DB `EXCLUDE` constraint on the generated `slot_range` tsrange.

### Supporting libs
- `src/lib/slot-expansion.ts` — pure time math: `expandScheduleRange()` (sections → slot drafts), `slotEndTime()` (midnight wrap), `rangesOverlap()`, `resolvePrice()` (multiplier/absolute)
- `src/features/turfs/booking-calendar.ts` — `classifyBookingDays()`: each day is past / outside horizon / closed / empty / full / open (priority-ordered)

### Slot status lifecycle
`available` → `held` (payment flow) → `booked` (frozen time/price); owners may toggle `available` ↔ `blocked`/`maintenance`; booked/held slots are untouchable by owner edits.

---

## 8. File Map

```
Routes
  src/app/(auth)/turf-owner/page.tsx              dashboard
  src/app/(auth)/turf-owner/turfs/new/page.tsx    create turf
  src/app/(auth)/turf-owner/turfs/[id]/page.tsx   manage turf (details + slots tabs)
  src/app/own-a-turf/page.tsx                     public application

Features
  src/features/turfs/            actions, queries, schemas, materialize, booking-calendar, formats
  src/features/turf-applications/ actions, queries, schemas
  src/features/turf-claims/      actions, invites, owner-account, queries, schemas
  src/features/owner-login/      actions, codes
  src/features/bookings/         booking actions (owner block/unblock etc.)

Components
  src/components/turfs/          turf-form, schedule-builder-form, saved-schedules-card,
                                 turf-booking-calendar, add-slot-form, my-turf-card,
                                 slots-dashboard/{booking-horizon-select,day-panel,...}
  src/components/turf-applications/turf-application-form.tsx

Schema
  src/db/schema/{turfs,turf-applications,turf-claims,owner-login-codes,bookings,users,enums}.ts

Libs
  src/lib/{auth,capabilities,slot-expansion,slot-planning,bd-holidays}.ts
```
