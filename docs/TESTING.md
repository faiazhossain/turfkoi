# DeshiTurf — Testing (J5)

> J5: "Negative E2E tests. Abandon payment, cancel, dispute — not just the
> happy path."

The scope decision for Phase 8 was: vitest + server-action / pure-logic tests
for the negative paths. A browser-based E2E harness is intentionally out of
scope for the MVP build (introducing Playwright + DB fixtures is its own
project).

## Run

```bash
npm test              # one-shot
npm run test:watch    # watch mode
```

The tests are pure-logic (no DB). They cover the negative paths the audit
calls out: cancellation policy edge cases, the dual-control threshold, and
magic-byte spoof detection.

## What's covered

- `src/features/__tests__/cancellation.test.ts` — every per-turf-owner policy
  (flexible / moderate / rebook_contingent / strict) at the rejection
  boundaries: inside the no-refund window, past the cutoff, post-kickoff.
- `src/features/__tests__/file-validation.test.ts` — H5 magic-byte sniff
  against spoofed inputs (HTML disguised as an image, random bytes, a PNG
  disguised as a JPEG).
- `src/features/__tests__/referrals.test.ts` — the H4 dual-control threshold
  off-by-one boundary, plus a cross-check that the strict policy + magic-byte
  guards both still reject.

## When a DB test harness lands (post-MVP)

- Spin up a dedicated `deshiturf_test` Neon branch.
- Set `DATABASE_URL=postgres://…@host/deshiturf_test` before `npm test`.
- Add integration tests under `src/features/__tests__/` that exercise the
  real server actions (`cancelBookingAction`, `requestRefundAction`,
  `approveRefundAction`, `resolveMatchDisputeAction`) against seeded fixtures.

The `vitest.config.ts` already aliases the `server-only` stub so server
modules can be imported in a test context; only the DB wiring is missing.

## CI

`npm test` runs without a DB and passes. Add it to `.github/workflows/ci.yml`
alongside lint/typecheck/build so a regression in any of the pure-logic
guards fails the build.
