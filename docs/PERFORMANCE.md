# Turfkoi — Backend Performance Targets (J1)

> J1: "Add backend performance targets. p95 < 300ms read APIs, < 800ms
> booking/payment initiation, < 5s webhook end-to-end."

Frontend targets existed in the spec; these are the backend counterparts.

## Targets

| Surface | p50 | p95 | Notes |
|---|---|---|---|
| Read APIs (RSC data fetches, /turfs, /matches) | < 100 ms | < 300 ms | PostGIS queries must hit the GiST index. |
| Booking creation (`holdSlotAction`) | < 300 ms | < 800 ms | Includes the conditional UPDATE + slot_holds insert + Inngest schedule. |
| Payment initiation (`initiatePaymentAction`) | < 500 ms | < 800 ms | bKash network call dominates; the DB writes are fast. |
| Webhook end-to-end (signature → confirm → settle-schedule) | < 1 s | < 5 s | The webhook handler must not block on slow work; settle happens async via Inngest. |
| Admin list queries (users / bookings / transactions) | < 200 ms | < 600 ms | Capped at 50 rows; indexes on `status`, `created_at`. |

## How we measure

- **`Server-Timing` header** — `src/lib/server-timing.ts` wraps the three hot
  paths. In dev, the header shows up in the browser Network panel so you can
  spot a regression immediately.
- **Structured `perf` log lines** — every `withTiming` call emits
  `{ route, ms, ok }` to stdout. In production, the log drain aggregates p95.
- **Vercel request logs** — provider-side p95 as an external sanity check.

## Known hotspots + mitigations

- **`listTurfs` PostGIS query** — `ST_DWithin` + `ST_Distance` use the GiST
  index on `coords`. Without the index this is a full scan; the migration
  README reminds you to add it via raw SQL after the first push.
- **`listSettledForPayout`** — pulls all success transactions for the week.
  Capped at the period range; for very large owners this needs an index on
  `(booking_id, status)` — already present via `transactions_status_idx`.
- **`listRefundRequests` self-join** — deliberately split into two queries
  (requester + approver lookups) to avoid the users self-join.

## What we DON'T target yet

- Long-tail (p99). The p95 target catches the regressions that matter for a
  booking flow; p99 noise is fine.
- Web vitals (LCP / INP). Frontend concern; tracked separately.
