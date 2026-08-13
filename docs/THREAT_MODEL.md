# Turfkoi — Threat Model (H1)

A STRIDE-style one-pager, surface by surface. Audit H1 calls for an
operationalized threat model; this is it. Pair with `AUDIT_DECISIONS.md` §H for
the locked security decisions.

## Surfaces

### 1. Authentication (`src/features/auth/`, `src/auth.config.ts`)
- **Spoofing** — phone + OTP. Mitigated by D2 (6-digit, 5-attempt lockout,
  60s resend, per-phone Upstash rate limit). OTP codes hashed at rest.
- **Tampering** — JWT in httpOnly secure cookie; Auth.js handles signing.
- **Repudiation** — every OTP issue + verify is logged with phone (redacted
  in logs via H6) + IP. Audit log (H2) captures role/permission changes.
- **Info disclosure** — OTP mocked in dev (console + dev toast); production
  swaps in a BD SMS gateway. The mock MUST stay gated behind `NODE_ENV`.
- **DoS** — Upstash rate limit on OTP verify (10/min/phone, 20/min/IP).

### 2. Booking + payments (`src/features/bookings/`)
- **Spoofing** — booker identity bound to JWT; `holdSlotAction` re-checks via
  `getCurrentUser()`.
- **Tampering** — transaction `amount` and `platformFee` are immutable after
  creation (enforced by a DB trigger per SS37). Transitions are conditional
  `UPDATE … WHERE status=…` so concurrent webhook/hold/cancel races have one
  winner.
- **Repudiation** — `cancellations` row records who cancelled + the refund
  amount; `refund_requests` rows are staged with `requestedBy` + `approvedBy`
  (H4 dual-control).
- **Info disclosure** — bKash `providerReference` (the trxId) is redacted by
  the logger (H6) before any line is written.
- **DoS** — slot-hold rate limited (`hold:${userId}`, 5/min). Booking creation
  is guarded by the partial unique index `bookings_active_unique`.
- **Elevation** — payouts + refund execution require the `admin` role.

### 3. Webhooks (`src/app/api/payments/bkash/webhook/`)
- **Spoofing** — bKash webhook is verified by **both** signature AND source IP
  allowlist (H3). Signature alone is insufficient.
- **Tampering** — idempotent via `provider_reference` unique constraint.
- **DoS** — webhook handler is fast (no slow work in the request path); the
  settle job runs asynchronously via Inngest.
- **Elevation** — webhook never authenticates as a user; it acts on a
  transaction row using conditional UPDATEs only.

### 4. Admin (`src/app/(auth)/admin/`, `src/features/admin/`)
- **Spoofing** — admin guard runs server-side in the layout AND inside every
  action (`requireAdmin()`). Client UI is defense-in-depth only.
- **Elevation** — `user.roles.includes("admin")` checked at every mutation.
  Self-suspend / self-role-removal explicitly blocked.
- **Repudiation** — every admin refund writes a `refund_requests` + a
  `cancellations` row. Dispute resolutions + report status changes are
  persisted with timestamps.
- **Fraud (the big one)** — refunds > Tk5,000 require dual-control (H4): the
  requesting admin cannot approve their own request.

### 5. File uploads (`src/app/api/turfs/upload-*`)
- **Spoofing** — content-type allow-list is the first gate; H5 magic-byte
  verification is the second. A mismatch deletes the uploaded object.
- **Tampering** — presigned URLs are minted with a 90s TTL and a max
  `ContentLength`; the key is server-generated (random UUID).
- **DoS** — 8 MB cap enforced via `ContentLength` on the presigned PUT.
- **Info disclosure** — uploads are scoped to `turfs/<turfId>/...` keys and
  the route checks `turf.update` capability before minting.

### 6. Audit log (`audit_logs`, H2)
- **Tampering** — production uses an INSERT-only DB role (`audit_app`). The
  SQL is in `drizzle/audit-role.sql`. UPDATE/DELETE are REVOKE'd.
- **Info disclosure** — `actor_id` is intentionally NOT a FK so audit history
  survives user deletion; no PII is stored on the row besides the hashed id.

### 7. Account data (K3)
- **Info disclosure** — deletion is soft for 14 days, then hard-anonymization
  erases name/phone/email/coords. Phone is replaced with `deleted:<hash>@local`
  so the unique constraint still holds but the number is unrecoverable.

## Operational notes
- **Logs (H6)** — every line is JSON with PII pre-redacted. Convention: no PII
  in log calls; the redactor is the safety net, not the primary defence.
- **Backups / DR (K1)** — see `docs/DR.md`.
- **Alerting (K2)** — see `docs/ALERTING.md`.
- **Perf (J1)** — see `docs/PERFORMANCE.md`.

## What is explicitly OUT of scope for MVP
- Payment split between Team A + Team B (B5 — deferred to P1).
- Nagad (B6 — deferred to P1).
- Light mode (I2 — deferred to P1).
- Referral reward accounting (A3 — P1; only the attribution scaffold ships in MVP).
