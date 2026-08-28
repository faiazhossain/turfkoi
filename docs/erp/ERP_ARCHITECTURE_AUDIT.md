# ERP Architecture Audit — DeshiTurf

Pre-implementation audit of the existing system, as required before any ERP code is written.
Written 2026-08-28 against `main` (`7c441cc`).

---

## 1. Existing architecture (what ERP builds on)

### Money data (single source of truth — already exists)

| Table | Key fields | ERP relevance |
|---|---|---|
| `bookings` | `turfId`, `date` (date col, local business day), `status` (held→payment_pending→confirmed→completed/cancelled/refunded), `totalAmount`, `bookerId` | Booking revenue, occupancy, customer analytics |
| `transactions` | `amount` (turf-side), `platformFee` (5%, cap ৳100, immutable), `provider` (bKash MVP), `status` (created→pending→success→refunded/partially_refunded), `currency` | Net owner revenue = `amount − platformFee − refunds` |
| `payouts` | weekly per-owner net (`amount − platformFee`), `status` pending→scheduled→paid/failed | Already a per-owner aggregation precedent |
| `cancellations` | `refundAmount` per booking | Refund adjustments in P&L |
| `refundRequests` | dual-control for refunds > ৳5,000 | Audit model to mimic |

**Critical rule:** platform fee is never refunded; refunds come out of the owner's share
(`src/lib/cancellation.ts:17-18`). Every ERP revenue figure must use owner-share math, not `totalAmount` alone.

**Day boundaries are safe**: `bookings.date` is a `date` column (business-local day), so
revenue-by-day aggregations need no timezone gymnastics. "Today" must still use the
Asia/Dhaka helper in `src/lib/slot-expansion.ts:353`.

### Auth & authorization

- `getCurrentUser()` (`src/lib/auth.ts`) — per-request cached, fresh DB roles. Authoritative.
- `can(user, capability, ctx)` (`src/lib/capabilities.ts`) — resource-scoped (`ownerId`), admins always pass. Current capabilities: `team.update`, `team.member.manage`, `turf.update`, `booking.cancel`, `match.result.submit`. ERP adds `erp.*` capabilities here — no parallel permission system.
- Route protection via middleware (`src/auth.config.ts`) for `/turf-owner/*` — ERP routes under `/turf-owner/erp/*` inherit this for free.

### Owner lifecycle (trial anchor)

Two paths make a user an owner:
1. **Claim flow** — admin seeds turf → claim invite → `claimTurfAction` flips `turfs.ownerId`, grants `turf_owner` (`src/features/turf-claims/`)
2. **Self-created turf** — `createTurfAction`

**Authoritative trial start** = `MIN(turfs.createdAt) WHERE ownerId = user` (covers both paths; claim is just an ownership flip on an existing row). Not first ERP open, not role-grant timestamp.

### UI system (reuse, never reinvent)

- Base UI + CVA component kit in `src/components/ui/`: `Button` (with `loading` prop), `Card`, `Table` (responsive overflow), `Tabs`, `Select`, `Sheet` (bottom sheet on mobile — use for quick-add forms), `Dialog`, `Tooltip`, `Calendar`, `Badge`.
- Approved loaders only: `Loader` / `LoaderOverlay` (`.app-loader`), `LoadingState` skeletons. `loading.tsx` per route + `RouteTransitionOverlay`.
- Shared: `KpiTile` (label/value/hint), `EmptyState`, `StatusBadge`, `MyTurfCard`.
- Sub-nav precedent: `AdminSubNav` (`src/components/admin/admin-sub-nav.tsx`) — horizontal scrollable, i18n keys, badges. ERP nav clones this pattern.
- Dark-first tokens (`#8CE000` green, `#7453FA` purple), Geist + Noto Sans Bengali, chart colors already mapped in `globals.css`.

### Infra

- i18n: nested dictionary groups (`turfOwner.kpis.*` precedent), parity test enforces en/bn key + placeholder match, `labels.ts` typed enum maps, server actions return dictionary keys.
- Notifications: `createNotifications()` / `notifyAdmins()` + Pusher real-time + bell at `/notifications`. ERP alerts reuse this — no new architecture.
- Formatting: `formatBdt()`, `formatSlotDate()`, `formatDateRange()`, bn locale support.
- Validation: Zod v4 + RHF; error keys via `t(res.error ?? "errors.generic")`.
- Tests: Vitest, ~246 cases, colocated `__tests__/`.
- DB: Drizzle + Neon, dev is push-managed (apply DDL directly if push hits TTY prompts — project convention); 15 SQL migrations numbered `00xx_*.sql`.

---

## 2. Reusable modules (ERP must consume, not duplicate)

| Need | Existing module | Do NOT create |
|---|---|---|
| Booking revenue | `bookings` + `transactions` SQL aggregation | Any manual revenue entry for platform bookings |
| Turf list/scoping | `listMyTurfs(ownerId)`, `turfs.ownerId` | Owner/turf registry |
| Owner identity/roles | `users`, `user_roles`, `can()` | ERP role system |
| Alerts | `createNotifications` + Pusher | Notification tables/pipes |
| Currency/date formatting | `formatBdt`, `format-date.ts` | New formatters |
| Slot blocking for maintenance | `turf_slots.status = maintenance/blocked` + day panel | New availability system |
| Mobile forms | `Sheet`, `Dialog`, RHF+Zod pattern | New form framework |
| Holiday calendar | `src/lib/bd-holidays.ts` (Ramadan window) | Holiday data |

---

## 3. Required new modules (gaps with no existing equivalent)

1. **ERP profile + trial/plan state** — nothing tracks trial or premium today.
2. **Expenses, categories, recurring rules, bills, rent contracts** — zero expense capture exists.
3. **Staff + salary records/payments** — nothing exists.
4. **Maintenance records** (cost ledger; availability stays in existing slot system).
5. **Manual/other income** (cash collected off-platform — bKash is the only online rail today).
6. **Audit log** — no audit table exists anywhere; financial records need one.
7. **Export (CSV)** — no export utility exists.
8. **Reporting/BI queries** — `getOwnerKPIs` covers today/next-7-days only.

---

## 4. Data dependencies & risks

| Risk | Mitigation |
|---|---|
| Double-counting income (manual income vs booking revenue) | Manual income entries are for **off-platform money only**; UI copy must say so. Booking revenue never manually editable. |
| Owner-share confusion (৳ total vs ৳ after platform fee) | All ERP revenue displays owner share; tooltip explains "platform fee বাদে". |
| No `turfs.ownerId` index | Owner-wide revenue aggregates scan `bookings ⋈ turfs`; add index in the ERP migration. |
| Timezone drift in "today/this month" | All period boundaries computed via Asia/Dhaka helper; `bookings.date` is already business-local. |
| Trial backfill for existing owners | Migration computes `trialStartsAt = MIN(turfs.createdAt)` per existing owner; lazy-create profile on first ERP read for new owners. |
| Numeric precision | All money columns `numeric(12,2)` like `transactions`; sum in SQL, never in JS over fetched rows. |
| Salary overpayment | Validation: paid ≤ payable unless flagged as advance (server-side). |
| Deletion of financial records | Soft-void (`status='void'`) + audit row; no hard deletes for posted expenses/salaries. |

---

## 5. Security concerns

- Every query/action scoped by `ownerId = currentUser.id` server-side; `turfId` from client never trusted — always verified via `SELECT turfs WHERE id AND ownerId`.
- New capabilities (`erp.read/update`, `erp.finance.*`, `erp.staff.*`, `erp.reports.read`) registered in `src/lib/capabilities.ts`; admin bypass inherited.
- Financial data never in client logs (`src/lib/logger.ts` already redacts PII — extend patterns).
- Exports generated server-side and streamed; scoped to the requesting owner.
- Audit log rows are append-only (no update/delete actions exposed).

## 6. Migration requirements

One numbered SQL migration (`0015_erp_foundation.sql` style) creating: `erp_profiles`,
`erp_expense_categories`, `erp_expenses`, `erp_recurring_rules`, `erp_other_income`,
`erp_staff`, `erp_salary_records`, `erp_rent_contracts`, `erp_maintenance_records`,
`erp_audit_logs` + `index turfs(ownerId)` + backfill of trial start dates for existing owners.
Budgets/goals deferred to Phase 3 (see PRD) — not created upfront.

## 7. Performance concerns

- Dashboard aggregates = a handful of grouped SQL queries (`SUM/GROUP BY date, category`) with `bookings.date` / `expenses.date` range predicates + indexes. No row fetching to the client.
- Peak-hour analytics: group by extract-hour from `turf_slots`/`bookings` time columns — `slotStart` is a time column, index-friendly.
- Insights (e.g. "Friday = 31% of weekly revenue") computed server-side per dashboard load; no client recompute.
- Pagination on lists (expenses/staff/salary history) — default limit 20, cursor or offset.

## 8. Product gaps (recognized, deferred deliberately)

- No payment rail for subscription billing → MVP premium = admin-granted; real billing later.
- No partial payments on bookings → ERP salary partials are ERP-local, independent of booking money.
- No attachment/file storage audit → invoices/attachments deferred past Phase 2.
- Offline payment methods (cash at the gate) invisible to platform → covered by manual income with clear labeling.

## 9. Recommended architecture (summary)

- Feature module: `src/features/erp/` (subfolders `finance/`, `staff/`, `bills/`, `maintenance/`, `reports/` if file size demands), mirroring `src/features/turfs/` shape: `actions.ts`, `queries.ts`, `schemas.ts`.
- Routes: `src/app/(auth)/turf-owner/erp/` with its own `layout.tsx` (role guard + ERP sub-nav, cloned from admin layout pattern) and per-route `loading.tsx` (`LoaderOverlay`).
- Components: `src/components/erp/` reusing the shared kit.
- Dictionary group: `erp.*` in both dictionaries, parity-tested.
- One source of truth for money: `transactions`/`bookings` (platform) + `erp_expenses`/`erp_other_income` (owner-entered); profit is always computed, never stored.
