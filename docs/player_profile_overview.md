# Player Profile — Area Overview

Developer reference for everything in the DeshiTurf **player profile** area: the profile record, onboarding capture, availability toggle, matchmaking discovery, join-request flow, played confirmation, and settings (avatar, account deletion). Traces to requirements SS18, SS20, SS32, F2, F7, A3, and section 34 of `PROJECT_REQUIREMENTS.md`.

---

## 1. Routes & Pages

### Player Dashboard — `src/app/(auth)/app/page.tsx`
The player's landing page (`/app`). Any authenticated user lands here unless a purer home applies (a pure admin is redirected to `/admin`; admins who also own turfs/teams keep access).

- Header: display name + phone
- Role switcher ("Switch hats") — links to `/turf-owner` and `/admin` when the user holds those roles
- `AvailabilityToggle` ("Available tonight", SS18)
- Invite friends card (A3 referral MVP): referral code URL + WhatsApp share
- My bookings (latest 5, `listMyBookings`) → `/bookings/[id]`
- "Play Tonight" — matches needing players (latest 5, `listMatchesNeedingPlayers`, geo-sorted) with `JoinRequestButton`
- Match history (latest 5, `listPlayerMatchHistory`) with `ConfirmPlayedButton` on completed, unconfirmed matches

All four data fetches run in one `Promise.all`.

### Settings — `src/app/(auth)/app/settings/page.tsx`
- `AvatarField` — player photo upload (Cloudinary-backed); the preview renders whichever avatar mode is active (photo / preset / initials) via `resolveAvatarDisplay`
- Link to `/app/profile/edit`
- Danger zone — `DeleteAccountButton` (K3: soft-delete now, hard anonymize after a 14-day grace window via Inngest)

### Player Profile — `src/app/(auth)/app/profile/page.tsx`
The player identity page (`/app/profile`; the nav "Profile" item points here).
- Identity card — `PlayerAvatar` (photo / preset / initials), name, localized position · secondary · skill line, area, availability `StatusBadge` (fresh within the 24 h SS18 window via `isAvailabilityFresh`), Edit CTA
- About — the bio, or a muted "add an intro" line
- Playing info — position / secondary / skill / area rows; canonical ids render localized, legacy free text renders raw
- Completion meter — filled/7 over name, avatar, position, skill, area, bio, coords, with "add your …" suggestions
- `loading.tsx` (LoadingState skeletons) at `/app/profile` and `/app/profile/edit`

### Profile Edit — `src/app/(auth)/app/profile/edit/page.tsx` + `ProfileEditForm`
Server shell (auth + `getPlayerProfile`) around a client RHF form (`zodResolver(profileEditFormSchema)` — deliberately lenient on position/skill so legacy free text never blocks saving; the server action re-validates strictly). Fields:
- `AvatarPicker` — Tabs "Avatar | Photo": preset grid (grouped by series tabs; sr-only radio tiles, green ring + check on the selected badge) or the existing `AvatarField` photo upload (instant persist). Preset selection is form state persisted on Save through `updateProfileAction`; uploading a photo persists immediately via `setPlayerAvatarAction`
- Name, primary position (`PositionPicker`), optional secondary position (with a "none" chip), skill (`SkillPicker`), area, bio (`Textarea`, 280 chars + counter), `LocationPicker` (submitted only when the user actually moves the pin — otherwise the stored ~110 m coords are left untouched)
- Success → toast + `router.push("/app/profile")`

### Onboarding — `src/app/auth/onboarding/page.tsx`
Client component shown after sign-up. Captures the profile in one pass: display name, position, skill, area, and map-picked coords (`LocationPicker`; picking a place autofills area). Submits `completeOnboardingAction` (`src/features/auth/actions.ts`), which updates `users.name` and writes the profile fields, then redirects to the pending turf claim if a claim cookie is present, else `/app`.

### Match Detail — `src/app/(public)/matches/[id]/page.tsx` (player matchmaking parts)
- **Player side**: `JoinRequestButton` when signed in, match state is `confirmed`/`roster_building`, the user is not on the roster, manages no team in the match, and open spots exist
- **Captain side**: `RequestManager` (pending join requests) and a "solo players available near this turf" section — `MapView` with approximate player pins + a distance-sorted list; players already on the roster or already requesting are filtered out

---

## 2. Feature Module — `src/features/player/`

### Server actions (`actions.ts`)

| Action | Purpose | Notes |
|---|---|---|
| `toggleAvailabilityAction()` | Flip "Available tonight" (SS18) | Upserts the profile row, flips `available`, stamps `availableAt`; returns the new value |
| `updateProfileAction(input)` | Full identity write: name, position, secondary position, skill, bio, area, coords, avatar mode | Zod-validated (`updateProfileSchema`; dict-key errors). `undefined` = leave untouched, `null` = clear. Coords written **only when present** (rounded ~110 m, F7) — an absent key no longer wipes the pin. Preset avatar choices are validated against the catalog whitelist (`isPresetAvatarId`) and keep `avatarPublicId` (non-destructive). UI caller: `/app/profile/edit` |
| `requestToJoinAction(matchId)` | Player requests to join a match (SS20) | State-gated (`roster_building`/`confirmed`); rejects if already on roster; idempotent via `onConflictDoNothing` on PK `(matchId, userId)` |
| `acceptPlayerRequestAction(matchId, playerId, teamId)` | Captain accepts | Requires `owner`/`captain` team role; request must be pending; enforces `ROSTER_LIMITS`; inserts `match_players` with `role=guest`; marks request accepted |
| `rejectPlayerRequestAction(matchId, playerId)` | Captain rejects | Caller must be owner/captain of at least one side in the match; sets request `rejected` |
| `confirmPlayedAction(matchId)` | "I played" confirmation (F2) | Caller must be on the roster; idempotent (no-op when `playedConfirmedAt` already set) |

Error values returned from actions are **dictionary keys** rendered via `t(res.error ?? "errors.generic")` (BN-first rule).

### Queries (`queries.ts`)

- `getPlayerProfile(userId)` — single profile row or `null`
- `listMatchesNeedingPlayers(playerCoords?, limit)` — matches in `roster_building`/`confirmed` with per-team open spots (`ROSTER_LIMITS` max minus filled); geo-sorts by `ST_Distance` (km) when the player has coords, otherwise stays chronological; returns `distanceKm` (`null` without coords)
- `listAvailablePlayersNearTurf(turfId, radiusKm = 10, limit = 20)` — the team→player direction: profiles with `available = true` and `availableAt` within the last **24 h** (stale toggles drop out), within `ST_DWithin` radius of the turf, nearest first; returns approximate lat/lng (rounded at write time)
- `listPlayerMatchHistory(userId, limit = 20)` — matches where a `match_players` row exists, newest kickoff first; includes scores, state, and `playedConfirmedAt`
- `listPendingPlayerRequests(teamIds)` — pending join requests for the captain's teams' matches, with player name + phone

### Schemas (`schemas.ts`)
- `updateProfileSchema` — the strict server contract: `name` (2–60, shared auth error keys), `position`/`secondaryPosition`/`skill` as canonical `z.enum`s (`POSITION_IDS`/`SKILL_IDS` from `positions.ts`), `bio` (≤280, whitespace-normalized, bidi/control chars stripped), `area` (≤80), `coords {lat, lng}`, `avatarType` ("photo"|"preset") + `avatarPresetId` cross-checked by `superRefine` against the catalog whitelist (crafted paths like `../../evil` rejected)
- `profileEditFormSchema` — the lenient client mirror used by the edit form's zodResolver (free strings for position/skill); canonicalization happens in the submit handler
- `positions.ts` — `POSITION_IDS` (`goalkeeper|defender|midfielder|winger|forward|striker|any`) and `SKILL_IDS` (`learning|casual|intermediate|good|competitive`). Columns stay plain text — legacy free text ("MID") keeps rendering raw via the null-fallback label helpers (`positionLabelKey`/`skillLabelKey` in `src/i18n/labels.ts`)

### Avatar catalog (`avatar-catalog.ts` + `public/avatars/`)
29 preset SVG badges across five series (football / equipment / stadium / numbers / abstract) — **strictly non-animate** football objects, equipment, stadium architecture, pitch geometry, numerals, abstract geometry (the Islamic-compliant design constraint: no humans, animals, faces, silhouettes, mascots, or religious content; expressed through design, never messaging). Pure module: `PRESET_AVATARS`, `PRESET_AVATAR_IDS` (exact-match Set — the server trust boundary), `AVATARS_BY_SERIES`, `isPresetAvatarId`, `presetAvatarSrc` (`?v=AVATAR_CATALOG_VERSION` cache-busting). Assets are 96×96 self-contained SVGs in the dark brand palette; the design language spec lives in the module header. `resolveAvatarDisplay` (`avatar.ts`) resolves any profile row to photo / preset / initials (`Intl.Segmenter`-safe Bangla initials).

---

## 3. Player-Facing Components (`src/components/player/`)

| Component | Purpose |
|---|---|
| `availability-toggle.tsx` | "Available tonight" button; variant flips with state, `loading` while the transition runs, toast + `router.refresh()` |
| `avatar-field.tsx` | Photo upload: `useImageUpload` → Cloudinary (`player` folder), then `setPlayerAvatarAction` (stamps `avatar_type='photo'`); instant persist, square crop, inline `Loader` while uploading, toast on failure; preview renders the active avatar mode |
| `avatar-picker.tsx` | Identity picker for the edit form: preset badge grid (series tabs, radio tiles, check badge) + photo tab embedding `AvatarField` |
| `choice-picker.tsx` | `ChoicePicker` sr-only-radio chip list + `PositionPicker`/`SkillPicker` wrappers; shared by profile edit and onboarding |
| `player-avatar.tsx` | Renders any `AvatarDisplay` (photo / preset / initials) at xs–xl; server + client safe |
| `profile-edit-form.tsx` | RHF edit form (avatar, name, positions, skill, area, bio, location) → `updateProfileAction` |
| `join-request-button.tsx` | One button per team with open spots; submits `requestToJoinAction`; toast on result |
| `request-manager.tsx` | Captain's pending-request list (name + phone) with accept/reject icon buttons |
| `confirm-played-button.tsx` | "I played" button on completed history rows; idempotent action |

All are client components using `useTransition`, the shared `Button` `loading` prop (spinner + `aria-busy` + disabled), dictionary-key toasts, and `router.refresh()`.

---

## 4. Database Schema

### `player_profiles` (`src/db/schema/users.ts`)
One-to-one with users — `userId` is the **primary key**, `ON DELETE CASCADE`.

- `position`, `skill`, `area` — free text; new writes store canonical ids, legacy values render raw
- `bio` — optional self-description (≤280; UI + DB CHECK)
- `secondaryPosition` — optional (≤24; UI + DB CHECK)
- `avatarType` — "photo" | "preset" | NULL (legacy: photo when `avatarPublicId` is set, else the initials fallback); DB CHECK constrains the values
- `avatarPresetId` — catalog id when `avatarType='preset'` (≤48; membership enforced by the server action against the catalog, not SQL)
- `avatarPublicId` — Cloudinary public id (asset in `deshiturf/players/{userId}`); kept when switching to a preset so the photo comes back
- `coords` — PostGIS geography point; **always stored rounded to 3 decimals (~110 m)** — the DB never sees a precise pin (F7)
- `available` (default false) + `availableAt` — the SS18 toggle; `availableAt` drives the 24 h freshness cutoff
- `createdAt` / `updatedAt`

The row is created lazily: every write path (`toggleAvailabilityAction`, `updateProfileAction`, `setPlayerAvatarAction`) upserts with `onConflictDoNothing` / `onConflictDoUpdate`; onboarding writes it directly.

### `match_players` (`src/db/schema/matches.ts`)
PK `(matchId, userId)`. `teamId` nullable (`set null` on team delete), `role` enum `member | guest` — join-request acceptances create **guests** (never permanent `team_members` rows, per the requirement 19 distinction). `playedConfirmedAt` — F2 confirmation timestamp, null until confirmed.

### `player_requests` (`src/db/schema/matches.ts`)
PK `(matchId, userId)` — one request per player per match, which is what makes `requestToJoinAction` idempotent. `status` enum `pending | accepted | rejected | cancelled | expired`, `createdAt`.

---

## 5. Flows

### Profile creation
1. Sign-up → `/auth/onboarding` (name, position/skill via the shared pickers, area, map coords)
2. `completeOnboardingAction` writes `users.name` + profile fields (coords rounded), revalidates `/app`
3. Later edits: `/app/profile/edit` (avatar, name, positions, skill, area, bio, location) or the photo-only path via `/app/settings`

### Avatar mode switching (non-destructive)
- Photo upload (`setPlayerAvatarAction`) sets `avatarPublicId` + `avatarType='photo'`, destroying only the *replaced* photo
- Preset save (`updateProfileAction`) sets `avatarType='preset'` + `avatarPresetId`, keeping `avatarPublicId` — switching back to photo restores the original picture
- Display always goes through `resolveAvatarDisplay`, which degrades unknown preset ids to initials (never a broken image)

### Matchmaking (SS20/SS32)
- **Player → match**: dashboard "Play Tonight" lists open-roster matches, geo-sorted when the player has coords → `JoinRequestButton` → `player_requests` row (pending)
- **Team → player**: captain opens a match page → available players within 10 km of the turf (24 h freshness) on the map + list

### Join request lifecycle
```
requestToJoinAction            acceptPlayerRequestAction        rejectPlayerRequestAction
pending  ────────────────────▶ accepted (match_players row,
                                          role=guest)
        ────────────────────▶ rejected
```
Accept path checks, in order: captain role → request pending → match exists → roster limit → insert guest + mark accepted.

### Played confirmation (F2)
Completed match appears in history with `ConfirmPlayedButton` → `confirmPlayedAction` stamps `playedConfirmedAt` on the `match_players` row (no-op if already set). Button disappears on refresh.

---

## 6. Privacy & Safety Notes

- **Approximate location (F7)** — `roundCoords()` (`src/lib/geo.ts`, 3 decimals ≈ 110 m) is applied at write time in both `completeOnboardingAction` and `updateProfileAction`; discovery queries only ever see the rounded pin
- **Freshness** — a stale `available = true` (>24 h) silently drops out of `listAvailablePlayersNearTurf`
- **Idempotency** — join requests and played confirmations are natural no-ops on repeat; both keyed by composite PKs / null-checks
- **Roster integrity** — roster limits enforced at accept time from `ROSTER_LIMITS`; guests never leak into `team_members`
- **Account deletion (K3)** — profile rows cascade with the user; hard anonymize happens in the Inngest job after the grace window

---

## 7. Gaps & Open Items

- Requirement 34 fields not yet stored: preferred foot, matches-played counter, ratings/XP (marked [Future])
- "Teams Needing Players" filtering by position/skill (requirement 18 item 5) is not implemented — open spots are position-agnostic
- Avatar picking is not part of onboarding yet (available after signup via `/app/profile/edit`)
- No avatar *clear* action (photo can only be replaced or switched away from)

---

## 8. File Map

```
Routes
  src/app/(auth)/app/page.tsx                     player dashboard
  src/app/(auth)/app/profile/                     player identity page (+ edit/, loading.tsx)
  src/app/(auth)/app/settings/page.tsx            photo management + danger zone
  src/app/auth/onboarding/page.tsx                profile capture (client)
  src/app/(public)/matches/[id]/page.tsx          join request + captain request manager
                                                  + nearby available players (with avatars/bio)

Features
  src/features/player/           actions, queries, schemas, positions,
                                 avatar-catalog, avatar (display resolver), __tests__
  src/features/auth/actions.ts   completeOnboardingAction, requestAccountDeletionAction
  src/features/images/actions.ts setPlayerAvatarAction (Cloudinary, stamps photo mode)

Components
  src/components/player/         availability-toggle, avatar-field, avatar-picker,
                                 choice-picker, player-avatar, profile-edit-form,
                                 join-request-button, request-manager, confirm-played-button

Schema
  src/db/schema/users.ts         player_profiles (identity fields, 0019)
  src/db/schema/matches.ts       match_players, player_requests
  src/db/schema/enums.ts         match_player_role, request_status
  drizzle/0019_player_identity.sql

Assets
  public/avatars/*.svg           29 preset badges (strictly non-animate)

Libs
  src/lib/geo.ts                 roundCoords (F7), haversine distance
  src/lib/auth.ts                getCurrentUser / getSession
```
