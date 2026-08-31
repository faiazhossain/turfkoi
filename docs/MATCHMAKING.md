# DeshiTurf Matchmaking — How It Works

Count-first matchmaking: a captain creates a match by declaring **how many players they already have**, never by entering every player's identity. Identities (registered invites, guests) are filled in progressively afterwards. The core philosophy:

```
COUNT FIRST  →  RECRUIT LATER  →  IDENTIFY WHEN NEEDED
```

Designed so a first-time user understands it without instructions: "আমার ৭ জন player আছে" → "আরও ৩ জন দরকার" → "Player খুঁজি" → "Opponent খুঁজি" → **ম্যাচ কনফার্ম**.

---

## 1. Core concepts

| Concept | Meaning | Storage |
|---|---|---|
| **Team** | Permanent team identity | `teams` + `team_members` |
| **Match** | One specific game | `matches` (1:1 with a confirmed `bookings` row) |
| **Match side** | home / away (or the single solo side) | `match_teams` (`teamId = null` everywhere = the solo side) |
| **Match squad** | Players in *this* match — never auto-synced with the team roster | `match_players` + `match_guests` |
| **Guest** | Account-less player, scoped to this match only | `match_guests` (name + optional phone; auto-links on signup via `linkMatchInvitationsAndGuests`) |
| **Placeholder** | An un-named seat the captain claims count-first ("আমার ৭ জন আছে") | `matches.placeholder_count` (solo side) / `match_teams.placeholder_count` (team sides) |

Key architectural rule: **a match can exist with zero identified players** beyond the captain. The captain's declared count is stored as an integer, not as individual rows. Team roster (`team_members`) is never modified by match participation.

## 2. Capacity math (single source: `src/features/matches/formats.ts`)

```
filled    = identities (match_players + match_guests)
          + pending match_invitations   (a decline/cancel releases the seat)
          + placeholders                (declared un-named seats)

spotsLeft = max(0, squadSize − filled)
placeholdersUpperBound = max(0, squadSize − identities − pending)
```

- `spotsLeft(squadSize, accepted, pending, placeholders)` — every capacity guard and UI summary goes through this one function.
- `squadSize` is **per side** and includes substitutes. Format (`fives…elevens`) is the on-field count only: fives 5–12, sevens 7–14, nines 9–16, elevens 11–18.
- Squad roles: seats fill Starting first, then Substitute (`resolveSquadRole`); captains can promote/demote while the roster is open.
- **No auto-reconciliation:** when an invite is accepted or a guest is added, `filled` grows via the math and `spotsLeft` shrinks — but the placeholder count does **not** auto-decrement. Lowering it is the captain's explicit action (the UI shows a passive hint: "{count} জন এখনো নাম ধরে যোগ করা হয়নি — invite বা যোগ করার সাথে সাথে এই সংখ্যা কমিয়ে নিন"). This avoids silently rewriting the captain's stated intent and avoids races with concurrent accepts.

## 3. Match creation (count-first wizard)

Entry: a **confirmed booking** → `/bookings/[id]/create-match` (booker only, 1:1 with the match). `src/components/bookings/create-match-wizard.tsx`.

| Step | Question | Notes |
|---|---|---|
| 1 | Match format | 5v5 … 11v11 (existing `MATCH_FORMATS`) |
| 2 | Squad size | starters…maxSquad stepper, substitutes included |
| 3 | **"আপনার দলে এখন কয়জন player আছে?"** | **Full squad** chip (= squadSize) or a count stepper (1…squadSize). Live feedback: "আপনার ৭ জন player আছে। আরও ৩ জন player দরকার।" A contextual ⓘ tooltip explains: no names/numbers needed now. The team picker ("which team?") lives here too — picking a team ≠ collecting identities. |
| 4 | Nearby players *(optional)* | Only shown if spots remain; pre-invites from `listAvailablePlayersNearTurf` |

What creation does (`createMatchAction`):
1. Validates booking (confirmed, no existing match) and captain authority.
2. Guard: `1 (creator) + placeholders ≤ squadSize`.
3. Inserts the match (`state = "open"`), the creator as a Starting player, and the declared count (solo → `matches.placeholder_count`, team → the home `match_teams` row).
4. Redirects to the match room. **No phone numbers, friend requests, or guest names are collected here** — those tools all live in the match room.

## 4. Match room (progressive identification)

`/matches/[id]` — `src/app/(public)/matches/[id]/page.tsx`.

### The one obvious next action

| Situation | Primary UI |
|---|---|
| Open spots on my side | **Find Players** (jumps to nearby list) + **Add Guest** |
| Team match, my side full, state `open` | "Squad ready ✓ — এখন অন্য team-রা আপনার ম্যাচ challenge করতে পারবে" |
| Solo, squad full | Nothing needed — squad ready |
| Opponent accepted / roster phases | Manage requests, roles, results |

Per-side summary (`SquadSpots`): "৭ / ১০ player · আরও ৩ জন দরকার" (or "squad ready ✓"), the Starting chip, and a **± declared-count editor** for the side's captain (bounded by `placeholdersUpperBound`, so a side can never claim more seats than the squad has left).

### Ways players enter the squad (all draw from the same capacity pool)

1. **Invite registered players** — nearby list (geo + 24h "available" freshness + position filters), team members, or friends. Creates a pending `match_invitations` row; the player accepts/declines for themselves.
2. **Invite by phone** — registered number → user invite; unknown number → phone invite that links to their account on signup.
3. **Add Guest** — account-less, match-scoped (`match_guests`); a guest never joins the team roster.
4. **Join requests** — the reverse direction: players who see the match request to join; the captain accepts/rejects.

### Opponent flow (team matches)

- The match is published on `/matches` under "Open challenges" while `state = open`.
- Another team's captain hits **Challenge** → `acceptAsOpponentAction`, FCFS with a conditional-update race guard; the challenger becomes the away side and `state → confirmed`.
- **Both sides recruit independently**: the away captain sets their own declared count via their side's ± editor and fills remaining seats with the same invite/guest/request tools.
- Solo matches (`state = open`, no sides) are listed under "Captains looking for players" and surface in `listMatchesNeedingPlayers` for available players nearby.

### Status language (no technical jargon)

`matchStateContextLabelKey(state, solo)` in `src/i18n/labels.ts` renders conversational sub-lines: open solo → "Player খোঁজা হচ্ছে", open team → "Opponent খোঁজা হচ্ছে", confirmed → "ম্যাচ কনফার্ম হয়েছে".

## 5. Help UX

- **`MatchmakingHelp`** (`src/components/matches/matchmaking-help.tsx`): an unobtrusive "ⓘ কীভাবে কাজ করে" button (creation page header + match room heading) opening a 5-step dialog — the whole concept in a 10–20 second read.
- Contextual ⓘ tooltips where confusion is likely (e.g. beside the count question: "এখানে শুধু কতজন player ready আছেন সেটাই বলুন…").

## 6. Authority & lifecycle rules

- Roster edits (count editor, invites, guests, roles, removals) require `rosterOpen(state)` = `open | confirmed | roster_building` (`src/features/matches/authority.ts`).
- Solo side authority = the match captain; a team side = that team's owner/captain.
- Squad resizing stays match-captain-only; the shrink guard now checks `filled` (identities + pending + placeholders), not just the roster.
- Lifecycle: `open` → (opponent accepts) → `confirmed` → `ongoing` → `completed` (result submitted, other captain confirms). Solo matches can be played without an opponent.

## 7. File map

| Area | Files |
|---|---|
| Capacity math | `src/features/matches/formats.ts` |
| Queries (counts, fill, discovery) | `src/features/matches/queries.ts`, `src/features/player/queries.ts` |
| Server actions | `src/features/matches/actions.ts` (`createMatchAction`, `updatePlaceholderCountAction`, invites/guests/challenge/results), `src/features/player/actions.ts` (join requests) |
| Schema | `src/db/schema/matches.ts`, migration `drizzle/0023_match_placeholders.sql` |
| Wizard | `src/components/bookings/create-match-wizard.tsx`, `src/app/bookings/[id]/create-match/page.tsx` |
| Match room | `src/app/(public)/matches/[id]/page.tsx`, `squad-spots.tsx`, `squad-groups.tsx`, `match-actions.tsx` |
| Help | `src/components/matches/matchmaking-help.tsx` |
| i18n | `src/i18n/dictionaries/{en,bn}.ts` (`matches.wizard`, `matches.squad`, `matches.help`, `matches.stateContext`), `src/i18n/labels.ts` |

## 8. Deliberate trade-offs

- **Placeholder/identity drift:** after invites are accepted, `filled` stays at squadSize while identities < declared count until the captain lowers it. Accepted: honest counts beat silent rewrites; the hint nudges reconciliation.
- **Identities were removed from creation** (was: friends/team/phone/guest tabs). Everything those tabs did exists in the match room — creation now answers only "how many?".
- **Solo-side placeholders live on `matches`, team-side on `match_teams`:** two columns because the solo side has no `match_teams` row, and a synthetic row would leak into sides/notifications/results.
