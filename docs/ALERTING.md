# DeshiTurf — Alerting Thresholds (K2)

> K2: "Alerting thresholds. 5xx rate, p95 latency, payment-webhook failure
> rate, slot-expiry lag."

This is a runbook. No telemetry provider is locked in yet (per the Phase 8
scope decision); the numbers below are provider-agnostic. When we pick one
(Vercel native alerts + Sentry is the path of least resistance), wire each
threshold to that provider's notification channel.

## Thresholds

| Signal | Threshold | Window | Severity |
|---|---|---|---|
| **5xx rate** (app routes) | > 2% of requests | 5 min rolling | Page |
| **5xx rate** (app routes) | > 0.5% of requests | 15 min rolling | Warn |
| **p95 latency** (read APIs, J1) | > 600 ms | 10 min rolling | Warn |
| **p95 latency** (booking/payment init, J1) | > 1200 ms | 10 min rolling | Page |
| **Webhook end-to-end** (J1) | p95 > 8 s | 5 min rolling | Page |
| **Webhook failure rate** (non-2xx from bKash callback) | > 10% | 5 min rolling | Page |
| **Slot-expiry lag** (oldest expired `slot_holds` row age) | > 5 min | continuous | Page |
| **Settle-at-kickoff lag** (matches past kickoff still `confirmed`) | > 15 min | continuous | Warn |
| **OTP verify rate-limit hit rate** | > 50 / min globally | 5 min | Warn (possible brute-force) |
| **Refund `needsApproval` queue age** (oldest pending) | > 7 days | daily | Warn |
| **Failed bKash transactions** (status=`failed`) | > 20 in 1h | hourly | Warn |

## Provider wiring (when one is chosen)

**Vercel native** — Project → Settings → Observability → Alerts. Cover 5xx +
latency. Doesn't cover business metrics (webhook failure rate, slot-expiry
lag) — those need a custom probe.

**Sentry** — add `@sentry/nextjs`. Captures errors + perf traces; configure
the release tag from `process.env.VERCEL_GIT_COMMIT_SHA`. Use Sentry alerts
for 5xx + p95.

**Business metrics** (webhook failure rate, slot-expiry lag, refund-queue
age) — run a tiny Inngest cron that queries the relevant tables every 5 min
and emits a structured log line. The log drain (Vercel → Better Stack /
Datadog / similar) triggers on the threshold. This is the minimum custom
telemetry that pays for itself.

## Notification channels

- **Page** — on-call rotation (PagerDuty / Opsgenie). Off-hours muted for
  `Warn` severity.
- **Warn** — `#deshiturf-alerts` Slack channel.

## How to add a new alert

1. Add the threshold to the table above with a rationale.
2. Wire it in the chosen provider.
3. Add a synthetic check in code if it's a business metric
   (emit a structured `alert.check` log; let the drain threshold).
4. Document the runbook entry: what to do when it fires.
