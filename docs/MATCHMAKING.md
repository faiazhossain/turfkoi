# DeshiTurf Matchmaking — How It Works

Count-first matchmaking: a captain creates a match by declaring **how many players they already have**, never by entering every player's identity. Identities (registered invites, guests) are filled in progressively afterwards. The core philosophy:

```
BOOK A TURF  →  COUNT FIRST  →  RECRUIT LATER  →  CLAIM THE OPPONENT SIDE
```

Designed so a first-time user understands it without instructions: "টার্ফ বুক করলাম" → "আমার ৭ জন player আছে" → "আরও ৩ জন দরকার" → "Player খুঁজি" → কেউ "Opponent Side নিলে" → **ম্যাচ কনফার্ম**.

Teams are no longer part of matchmaking (the `/team/*` pages remain as a separate feature). Sides are plain person-based columns; legacy team-based matches keep rendering through backfilled data.

---

## 1. Core concepts

| Concept | Meaning | Storage |
|---|---|---|
| **Match** | One specific game, played on a confirmed booking | `matches` (1:1 with a confirmed `bookings` row) |
| **Home side** | The creator's side — they booked the turf and declared a count | `matches.captain_id` + `matches.placeholder_count` |
| **Away side** | The claimed opponent side — any player brings their own group | `matches.away_captain_id` + `matches.away_placeholder_count` |
| **Side membership** | Which side a player/guest/invite belongs to | `side` column on `match_players` / `match_guests` / `match_invitations` (migration 0024) |
| **Match squad** | Players in *this* match | `match_players` + `match_guests` |
| **Guest** | Account-less player, scoped to this match only | `match_guests` (name + optional phone; auto-links on signup via `linkMatchInvitationsAndGuests`) |
| **Placeholder** | An un-named seat a captain claims count-first ("আমার ৭ জন আছে") | `matches.placeholder_count` (home) / `matches.away_placeholder_count` (away) |
| **Legacy team sides** | Pre-0024 matches | `match_teams` (+ `opponent_requests`) — reads only, no new writes |

Key architectural rule: **a match can exist with zero identified players** beyond the captain. The captain's declared count is stored as an integer, not as individual rows.

## 2. Capacity math (single source: `src/features/matches/formats.ts`)

```
filled    = identities (match_players + match_guests)
          + placeholders                (declared un-named seats)

spotsLeft = max(0, squadSize − filled)
placeholdersUpperBound = max(0, squadSize − identities)
```

- `spotsLeft(squadSize, accepted, placeholders)` — every capacity guard and UI summary goes through this one function.
- **Pending invitations are prospects, not reservations.** They do not consume seats; a side may hold up to `maxPendingInvitations(openSeats)` = open seats + `OVER_INVITE_BUFFER` (3) — so need 1 → invite up to 4, need 3 → invite up to 6. Ignored invites can't lock anyone out, and a side with zero open seats takes no invites.
- **Seats are claimed first-accept-wins.** Every seat-claiming action (invite accept, guest add, join-request accept) runs one `db.batch` transaction (`src/features/matches/seat-claim.ts`): `SELECT … FOR UPDATE` on the match row serializes claims, a conditional `INSERT … WHERE seats-free` claims the seat, and a side-scoped `EXISTS` guard keeps the invite/request flip honest. A race loser gets `matches.errors.seatTaken` ("আপনি একটু দেরি করেছেন…") and their invite stays pending for the next open seat.
- `squadSize` is **per side** and includes substitutes. Format (`fives…elevens`) is the on-field count only: fives 5–12, sevens 7–14, nines 9–16, elevens 11–18.
- Squad roles: seats fill Starting first, then Substitute (`resolveSquadRole`); captains can promote/demote while the roster is open.
- **No auto-reconciliation:** when an invite is accepted or a guest is added, `filled` grows via the math and `spotsLeft` shrinks — but the placeholder count does **not** auto-decrement. Lowering it is the captain's explicit action (the UI shows a passive hint). This avoids silently rewriting the captain's stated intent and avoids races with concurrent accepts.

## 3. Match creation (booking-first, count-first wizard)

Entry: **"Create match"** on `/app` (Play-tonight header) or the `/matches` hub → `/matches/new`. Every signed-in user can create — anyone can book a turf.

`src/app/(public)/matches/new/page.tsx` + `src/components/matches/create-match-wizard.tsx`.

| Step | Question | Notes |
|---|---|---|
| 1 | **Your booking** | The user's eligible bookings: `confirmed`, kickoff in the future, no match yet (1:1). None eligible → "book a turf first" state with a `/turfs` CTA; `held`/`payment_pending` bookings show as "complete payment" rows. `?booking=<id>` preselects (the booking page's Create CTA deep-links here). |
| 2 | Match format | 5v5 … 11v11 (existing `MATCH_FORMATS`) |
| 3 | Squad size | starters…maxSquad stepper, substitutes included |
| 4 | **"আপনার Group-এ এখন মোট কতজন Player আছেন (আপনিসহ)?"** | **Full squad** chip (= squadSize) or a count stepper (1…squadSize). No names, no teams. |

What creation does (`createMatchAction`):
1. Validates booking (confirmed, booker, no existing match) — C1/C2 audit rules unchanged.
2. Guard: `1 (creator) + placeholders ≤ squadSize`.
3. Batch-inserts the match (`state = "open"`, home placeholders = declared count) and the creator as a Starting home-side player.
4. Redirects to the match room. **No phone numbers, friend requests, or guest names are collected here.**

## 4. Match room (progressive identification)

`/matches/[id]` — `src/app/(public)/matches/[id]/page.tsx`.

### The one obvious next action

| Situation | Primary UI |
|---|---|
| Open spots on my side | **Find Players** (jumps to nearby list) + **Add Guest** |
| Home captain, `state = open`, away unclaimed | "Opponent চাই — যেকোনো player তার group নিয়ে opponent side নিতে পারবে" note |
| Signed-in, not in the match, away unclaimed | **Opponent Side নিন** (declare your group count) |
| Opponent claimed / roster phases | Manage requests, roles, results |

Per-side summary (`SquadSpots`): "৭ / ১০ player · আরও ৩ জন দরকার" (or "squad ready ✓"), the Starting chip, and a **± declared-count editor** for the side's captain (bounded by `placeholdersUpperBound`).

### Opponent flow (person-based, replaces the team challenge)

- The match is listed on `/matches` (single list, badges: "Opponent চাই" / "Player চাই" / "আপনার ম্যাচ") while `state = open`.
- Any signed-in player **not already part of the match** hits **Opponent Side নিন** → `claimOpponentSideAction`: eligibility (`canClaimOpponentSide`) then a single FCFS conditional update `UPDATE matches SET away_captain_id = $me, away_placeholder_count = $n-1, state='confirmed' WHERE state='open' AND away_captain_id IS NULL` — a confirmed match always has an away captain, even under concurrent claims. Losers get "এইমাত্র অন্য কেউ নিয়ে নিয়েছে".
- The claimant becomes the **away captain**, is inserted on the away side, and the home captain gets a `match.opponent_claimed` notification.
- **Both sides recruit independently** with the same invite/guest/request tools.

### Ways players enter the squad (all draw from the same per-side capacity pool)

All four paths claim seats **first-accept-wins** through the same atomic batch (§2): whoever claims an open seat first gets it, a loser keeps their invite/request pending, and captains may over-invite (§2 buffer) so ignored invites never block.

1. **Invite registered players** — nearby list (`listAvailablePlayersNearTurf`: PostGIS ≤10 km + 24 h availability + name/position filters) or friends. Creates a pending `match_invitations` row on the inviter's side; when more invites are out than open seats, invitees see the accept-fast urgency line (`matches.invite.urgencyHint`) and a contested notification body.
2. **Invite by phone** — registered number → user invite; unknown number → phone invite linked on signup. Phones are normalized to `+8801XXXXXXXXX` at write time (`inviteMatchPlayersAction`), so the registered-number check and the signup link work for any format the captain types.
3. **Add Guest** — account-less, match-scoped; joins the adder's side. Carries the squad-sheet basics: name + **position** (canonical ids, `FIELD_POSITION_IDS` — "any" is availability, not a position) + **optional jersey number** (0–99) + optional phone (normalized, see below). The room shows a `#N` chip and the position label on the guest row.
4. **Join requests** — the reverse direction: players see a match (hub, `/app` Play tonight via `listMatchesNeedingPlayers`), request to join; **either side's captain** accepts (`acceptPlayerRequestAction` seats them on the accepting captain's side, atomically capacity-checked).

### Guest identity: quick-add and history linking

- **Quick-add chips** — the guest form lists players the captain added to previous matches (`listRecentGuestsAddedBy`, deduped by normalized phone / name in `src/features/matches/guests.ts`); one tap prefills all fields.
- **History linking** — a guest recorded with a phone surfaces in that person's **match history** once they sign up: `linkMatchInvitationsAndGuests` stamps `match_guests.linked_user_id`, and `listPlayerMatchHistory` unions linked guest rows into the rostered rows (a `mergeMatchHistory` pure merge in `src/features/player/history.ts`; the rostered row wins if the person was later also invited). Guest-sourced rows show a "Guest হিসেবে রেকর্ড করা" badge and never render the confirm-played button (no roster entry exists).

### Status language (no technical jargon)

`matchStateContextLabelKey(state)` in `src/i18n/labels.ts` renders conversational sub-lines: open → "Opponent চাই — মাঝপথে player-রাও যোগ দিতে পারবে", confirmed → "ম্যাচ কনফার্ম হয়েছে".

## 5. Help UX

- **`MatchmakingHelp`** (`src/components/matches/matchmaking-help.tsx`): an unobtrusive "ⓘ কীভাবে কাজ করে" button (creation page header + match room heading) opening a 5-step dialog — the whole concept in a 10–20 second read.
- Contextual ⓘ tooltips where confusion is likely (e.g. beside the count question).

## 6. Authority & lifecycle rules

- Roster edits (count editor, invites, guests, roles, removals) require `rosterOpen(state)` = `open | confirmed | roster_building` (`src/features/matches/authority.ts`).
- Side authority = that side's captain: home `matches.captain_id`, away `matches.away_captain_id` (`resolveSideCaptain` in `src/features/matches/queries.ts`; legacy team-based matches fall back to team roles on `match_teams`). Squad resizing stays home-captain-only; its shrink guard spans **both** sides' fill.
- Neither captain can be removed by others or leave their own match.
- Results: **either** side's captain submits (solo matches included); the **other** captain confirms.
- Lifecycle: `open` → (opponent side claimed) → `confirmed` → `ongoing` → `completed` (result submitted, other captain confirms). A solo match can still be played without an opponent.

## 7. File map

| Area | Files |
|---|---|
| Capacity math | `src/features/matches/formats.ts` (`spotsLeft`, `maxPendingInvitations`, `placeholdersUpperBound`) |
| Pure authority | `src/features/matches/authority.ts` (`sideOfCaptain`, `canClaimOpponentSide`, `rosterOpen`) |
| Atomic seat claims | `src/features/matches/seat-claim.ts` (`lockMatchForSeatClaim`, `seatsFreeSql`) |
| Guest quick-add / history merge (pure) | `src/features/matches/guests.ts` (`dedupeRecentGuests`), `src/features/player/history.ts` (`mergeMatchHistory`) |
| Queries (counts, discovery, side authority) | `src/features/matches/queries.ts` (`getSquadCounts`, `listOpenMatches`, `listRecentGuestsAddedBy`, `resolveSideCaptain`), `src/features/player/queries.ts` (`listMatchesNeedingPlayers`, `listPlayerMatchHistory`) |
| Server actions | `src/features/matches/actions.ts` (`createMatchAction`, `claimOpponentSideAction`, invites/guests/placeholders/results), `src/features/player/actions.ts` (join requests) |
| Schema | `src/db/schema/matches.ts`, migrations `drizzle/0024_person_based_sides.sql`, `drizzle/0025_guest_identity.sql` |
| Creation flow | `src/app/(public)/matches/new/page.tsx`, `src/components/matches/create-match-wizard.tsx` |
| Hub | `src/app/(public)/matches/page.tsx`, `src/components/matches/claim-opponent-button.tsx` |
| Match room | `src/app/(public)/matches/[id]/page.tsx`, `squad-spots.tsx`, `squad-groups.tsx`, `match-actions.tsx` |
| Help | `src/components/matches/matchmaking-help.tsx` |
| i18n | `src/i18n/dictionaries/{en,bn}.ts` (`matches.wizard`, `matches.claim`, `matches.hub`, `matches.squad`, `matches.help`, `matches.stateContext`), `src/i18n/labels.ts` |

## 8. Deliberate trade-offs

- **Placeholder/identity drift:** after invites are accepted, declared placeholders keep seats marked as claimed while identities < declared count, until the captain lowers the count. Accepted: honest counts beat silent rewrites; the hint nudges reconciliation.
- **Invites are soft:** the invite cap (`open seats + OVER_INVITE_BUFFER`) is not a hard invariant — a captain double-submitting concurrently can overshoot it, and each acceptance frees another invite slot. Harmless: invites claim nothing, the worst case is extra `seatTaken` toasts.
- **Role assignment reads outside the claim lock:** `resolveSquadRole(countStarting(...))` runs before the seat-claim batch, so two concurrent accepts into the last *starting* slot can both be labeled `starting`. Cosmetic (an over-full starting group on the UI); captains can bench. Accepted for now.
- **Buffer is hardcoded in copy:** the over-invite texts mention "৩টি/3" — if `OVER_INVITE_BUFFER` changes, update `matches.errors.tooManyInvites` and `matches.invite.overInviteHint` in both dictionaries.
- **Identities are out of creation; teams are out of matchmaking.** Creation answers "which booking?" and "how many?"; the match room owns everything else.
- **Legacy team matches** render through backfilled `side` columns and `match_teams` team-name labels, and remain manageable via the team-role fallback in `resolveSideCaptain`. No new `match_teams`/`opponent_requests` rows are ever written.
- **Side placeholders live on `matches`** (home/away columns) — the away side has no team row to hang a count on.
- **Guest phones are strict now:** `addGuestSchema` rejects anything that isn't a valid BD mobile (previously raw text was stored, which silently broke the registered-number guard and the signup link). Migration 0025 healed existing rows.
