# DeshiTurf — Disaster Recovery Runbook (K1)

> K1: "Define backup RPO/RTO + run a restore drill before launch."

This is a runbook, not code. The drill itself is operational: someone has to
actually execute it once a quarter. Neon hosts the DB.

## Provider: Neon (Postgres + PostGIS)

- **PITR (point-in-time recovery)** — Neon retains WAL for **7 days** on the
  free / Pro-base plans and up to 30 days on higher tiers. PITR lets you
  restore to a one-second granularity within that window.
- **Logical replication** — available; we use it for PITR fan-out to a
  warm-standby if we ever need sub-minute RPO (not currently wired).
- **Branches** — every Neon branch is a copy-on-write snapshot. Use a branch
  as the restore target for drills (cheap, isolated).

## Targets

| Metric | Target | How |
|---|---|---|
| **RPO** (data loss) | ≤ 5 min of committed writes | Neon WAL flush is synchronous; worst case is the in-flight txn at the moment of failure. |
| **RTO** (recovery time) | ≤ 1 hour | Branch restore (~5 min) + redeploy app with the new `DATABASE_URL` (~10 min) + verify (~30 min). |

For higher tiers (P1+): tighten RPO to ≤ 60s via logical replication to a
warm standby in a second region.

## Restore procedure (real incident)

1. **Identify the bad event timestamp.** Read `audit_logs` or the structured
   logs (H6) to find the last-known-good moment.
2. **Create a restore branch from PITR** in the Neon console:
   - Pick the source project → "Restore" → "Time travel" → enter the
     last-known-good timestamp (UTC).
   - Name the branch `restore-YYYY-MM-DD-HHMM`.
3. **Wait for the branch to be ready** (1–5 min depending on DB size).
4. **Grab the pooled connection string** for the new branch.
5. **Swap `DATABASE_URL`** in Vercel (Project → Settings → Environment
   Variables) and redeploy. Keep the old value as `DATABASE_URL_PREVIOUS` so
   you can roll back.
6. **Verify** against smoke checks (see drill below).
7. **Decommission** the old branch only after the team has signed off.

## Restore drill (quarterly)

Run this on a non-production day. Record the results in
`docs/drills/YYYY-MM-DD.md`.

- [ ] Pick a "simulated incident" timestamp ~24h in the past.
- [ ] Restore a branch via PITR (procedure above). Time it. Target: < 10 min.
- [ ] Run the smoke checklist:
  - [ ] `/turfs` loads, verified turfs visible.
  - [ ] A booking can be created end-to-end (hold → pay mock → confirm).
  - [ ] `/admin/payouts` lists the period's payouts.
  - [ ] `audit_logs` has rows up to the simulated timestamp.
  - [ ] PostGIS functions work: `ST_DWithin` returns nearby turfs.
- [ ] Diff the restored branch's row counts against production for:
  `users`, `turfs`, `bookings`, `transactions`, `payouts`, `refund_requests`,
  `audit_logs`. Any divergence → investigate before signing off.
- [ ] Document: timestamp drilled, RTO measured, issues found, owner of fixes.

## What's covered

- ✅ Logical data loss (bad migration, accidental DELETE, malicious overwrite
  via a stolen admin session).
- ✅ Region failure (Neon failover + Vercel redeploy).
- ❌ Provider dissolution (Neon goes out of business). Mitigation: quarterly
  `pg_dump` to R2 cold storage — owned by ops, not in the repo.

## What's NOT covered here

- **K2 alerting thresholds** — see `docs/ALERTING.md`.
- **K3 account deletion** — handled in app code
  (`src/features/auth/deletion.ts`); not a DR concern.
