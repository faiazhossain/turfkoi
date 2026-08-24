# Notifications

In-app notification system (Requirements §31: in-app only in MVP; push/email are post-MVP). This doc covers the shipped implementation, the type registry, and the deferred roadmap.

## How it works

- **Write path**: feature actions (applications, bookings) call the internal service in `src/features/notifications/create.ts` — `createNotifications(params, userIds)` and `notifyAdmins(params)`. Both are best-effort: failures are logged (`notifications.create_failed`) and never fail the host mutation.
- **Storage**: `notifications` table (`src/db/schema/system.ts`) — `user_id, type, payload jsonb, priority, entity_type, entity_id, read_at, created_at`. Payloads are denormalized at write time so rendering needs zero joins. Indexed on `(user_id, read_at)` (badge count) and `(user_id, created_at)` (keyset pagination). Never cached (§48).
- **Read path**: `GET /api/notifications` (auth'd, `no-store`, cursor pagination, includes `unreadCount` + `userId`). Server pages hydrate the first page via `listNotifications()` in `src/features/notifications/queries.ts`.
- **Marking read**: `markNotificationReadAction` / `markAllNotificationsReadAction` (`src/features/notifications/actions.ts`). Ownership is enforced in the SQL `WHERE` — marking another user's notification is a silent no-op.

## Realtime

- 30s polling is the baseline (`useNotifications` in `src/features/notifications/hooks.ts`, shared query key so the bell dropdown and `/notifications` page dedupe).
- When Pusher keys are set, the server publishes `notification.new` to `user-{userId}` (`src/lib/realtime.ts`); the bell dropdown subscribes, refetches instantly, and toasts `critical` notifications. Without keys everything gracefully degrades to polling (Requirements §49).
- Payloads carry only data already visible to that user; private channels + an auth endpoint are the follow-up if sensitive content ever rides the wire.

## Type registry

`src/features/notifications/types.ts` is the single source of truth — adding a notification type means: add the payload to `NotificationPayloads`, the zod schema in `schemas.ts`, and the registry entry (icon, priority, title/body/href renderers). Rows with unknown/malformed payloads render as a generic entry, never crash.

| Type | Audience | Priority | Deep link |
| --- | --- | --- | --- |
| `turf_application.submitted` | admin | info | `/admin/applications` |
| `turf_application.approved` | applicant | transactional | `/turfs/{slug}` |
| `turf_application.rejected` | applicant | info | — |
| `booking.confirmed` | booker | transactional | `/bookings/{id}` |
| `booking.received` | turf owner | transactional | `/turf-owner` |
| `booking.cancelled` | counterpart | critical | `/bookings/{id}` |

## UI surfaces

- **Desktop**: bell + unread badge in the site header (`notification-bell.tsx`) opening a popover dropdown (skeleton rows while loading, mark-all-read, "View all").
- **Mobile**: bell in the bottom nav links to the full-screen `/notifications` center (server-hydrated first page, `loading.tsx` skeleton).
- **Admin**: the Applications sub-nav item shows the pending-application count (fetched in the admin layout; kept fresh by the `revalidatePath` calls in the application actions).
- Signed-out users see no bell (the feed query 401s and the component renders null), keeping the header/mobile-nav shell static.

## Triggers wired

1. `submitTurfApplicationAction` → `notifyAdmins` + stamps `turf_applications.submitted_by` when signed in.
2. Approve/reject → applicant notified via `submitted_by`, falling back to a `users` lookup on the application email; anonymous submitters with no matching account get the claim-invite path instead.
3. `confirmPaymentAction` → booker (`booking.confirmed`) + owner (`booking.received`), deduped when they're the same user.
4. `cancelBookingAction` → the cancelling user's counterpart (`booking.cancelled`, refund amount only when notifying the booker).

## Deferred (post-MVP)

- Match/team/player events (opponent requests, player requests, results) — Requirements §31 lists the full set.
- `match_reminder` via the existing Inngest scheduling.
- Payout notifications (`payout.ready`) for turf owners.
- Pusher private channels + `/api/pushers/auth`.
- Email (Resend) for receipts/critical, FCM push.
