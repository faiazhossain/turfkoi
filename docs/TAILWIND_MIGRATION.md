# Tailwind Migration Plan — from global theme tokens to direct Tailwind control

**Status:** complete — all phases shipped (phases 1-12, with the match-room
and status-token resolutions described in their phase sections)
**Owner decision (2026-09-01):** style pages with explicit Tailwind classes instead of the
CSS-variable token layer (`--card`, `--primary`, … mapped to `bg-card`/`text-primary`), so
page-level styling is hand-controlled. Proven page-by-page on `/friends` (commits `106692a`,
`66cab0e`).

## Why

Today every page routes through one semantic token theme (`src/app/globals.css:84`), so no
matter what the design prompt (mockup HTML) asks for, output converges to the same look.
The owner wants per-page control: raw hex values straight from each approved mockup
(`friends.html` was the first: `#0b1220 / #151f33 / #1b2740 / #24324e / #22c55e / #3b82f6`).

## Current state (measured 2026-09-01)

- Token utility usage across `src/`: `text-muted-foreground` ×516, `border-border` ×219,
  `bg-muted` ×119, `bg-card` ×119, `text-foreground` ×103, `text-primary` ×76,
  `bg-primary` ×73, `bg-background` ×18, `bg-popover` ×9, `bg-accent` ×9, `bg-secondary` ×5
- ≈ **170 .tsx files** carry at least one token class
- App is **dark-only** (audit I2, `globals.css` `:root, .dark`); the `--input`/`--border`
  values have **contrast floors guarded by `src/app/__tests__/contrast.test.ts`**
- Token consumers live in three layers:
  1. `src/components/ui/*` primitives (Button, Card, Input, Dialog, …)
  2. shared components (`src/components/shared`, friends, matches, players, …)
  3. feature pages/routes (`src/app/**`)

## Ground rules for every phase

1. **One route/area per phase, one commit.** Never mix a restyle with a functional change.
2. **Mobile-first at 360px, BN + EN** (Bangla strings run long) — check both locales after
   each phase.
3. **No behavior changes:** server actions, loading states (`Loader`/Button `loading`),
   i18n dictionary keys, and a11y attributes (`aria-busy`, `role="tab"`, labels) survive
   verbatim. Only classes/markup change.
4. **BN-first strings** stay in `en.ts` + `bn.ts` in the same change if any new copy appears.
5. **Verification gate per phase:** `npm run lint && npm run typecheck && npm run test && npm run build`
   plus a manual pass of the touched routes (signed-in + signed-out where relevant).
6. **Local helper components** (like `friends-page.tsx`'s `GreenButton`/`PlayerRow`) are the
   pattern: per-page button/row factories written with raw classes, not new global primitives.
7. Keep a **running token→class map** in this file (see appendix) so pages stay consistent
   with each other while gaining explicit values.

## Palette contract (append to `@theme` in globals.css — Phase 1)

Register the mockup palette as flat, non-semantic Tailwind colors so classes stay greppable
and grep-replaceable (still "direct Tailwind", just named hex):

```
--color-dt-bg:    #0b1220   /* page backdrop (friends.html --bg)      */
--color-dt-bg2:   #0f172a   /* raised backdrop / modal bg             */
--color-dt-card:  #151f33   /* card surface                           */
--color-dt-card2: #1b2740   /* inset surface (rows, tiles)            */
--color-dt-line:  #354770   /* borders, dividers                      */
--color-dt-input: #64789a   /* input/control borders                  */
--color-dt-txt:   #e8eef7   /* primary text                           */
--color-dt-dim:   #93a4bf   /* secondary text                         */
--color-dt-green: #22c55e   /* primary action / online                */
--color-dt-teal:  #14b8a6   /* gradient pair for green CTAs           */
--color-dt-blue:  #3b82f6   /* secondary action / ID chips            */
--color-dt-red:   #ef4444   /* destructive / alerts                   */
--color-dt-ink:   #04240f   /* text on green                          */
--color-dt-off:   #64748b   /* offline presence dot                   */
```

Two constants deviate from the raw mockup hex to hold the contrast floors
(enforced against the palette in `contrast.test.ts` since Phase 1):

- `dt-line`: friends.html's `#24324e` measures 1.29:1 vs `dt-card2`, below the
  1.5:1 delineation floor — brightened to `#354770` (1.62:1).
- `dt-input`: the mockup has no input-border color; `#64789a` keeps the WCAG
  1.4.11 3:1 control boundary on every dt surface (the old `#5A6C86` fails
  vs `dt-card2` at 2.78:1).

Usage: `bg-dt-card border-dt-line text-dt-dim` — explicit, controlled, and one grep away
from a re-skin. Pages may also use arbitrary values (`bg-[#151f33]`) where a one-off value
is genuinely one-off; anything repeated twice goes into the palette instead.

## Phases

### Phase 0 — Proof of concept ✅ (done)
`/friends` hub + page shell rewritten with raw values (`friends-page.tsx`,
`(auth)/app/friends/page.tsx`). Local button/row factories, mockup hex, no token classes
on the page. Remaining on this area: `friends-card.tsx` (dashboard widget),
`/players/[code]`, `invite-to-match-dialog.tsx`, `qr-share.tsx` still use tokens.

### Phase 1 — Palette + guards ✅ (done)
- Add the `dt-*` palette block to `@theme` in `globals.css`; convert `/friends`' arbitrary
  hex values to `dt-*` classes (mechanical).
- Retarget `contrast.test.ts`: assert the **new** palette constants meet the same floors
  (line ≥1.5:1 vs card2/card, input ≥3:1). Delete token assertions only in the final phase.
- Deliverable: palette exists, tests green, no visual change outside `/friends`.

### Phase 2 — App chrome
Root layout body/background, site header, mobile nav, footers, `RouteTransitionOverlay`,
`loading.tsx` skeletons (`LoadingState`) → `dt-*` classes. This makes every later phase
sit on the correct backdrop and prevents "half-migrated" flashes.

### Phase 3 — Auth flows
`/login`, `/register`, `/forgot-password`, `/auth/onboarding` + auth form components.
Small surface, high traffic — good first end-to-end validation of the palette.

### Phase 4 — Player dashboard + profile
`/app` dashboard cards (including `friends-card.tsx`), `/app/profile`, `/app/profile/edit`
(`profile-edit-form.tsx`, `avatar-picker.tsx`), `/app/settings`.

### Phase 5 — Player Network finish
`/players/[code]` (+ `profile-actions.tsx`, `invite-to-match-dialog.tsx`, `qr-share.tsx`),
`/notifications` + `notification-bell.tsx` popover.

### Phase 6 — Matchmaking ✅ (done)
`/matches`, `/matches/new`, and `create-match-wizard.tsx` on `dt-*`. The match room kept
token classes only until Phase 10 gave `.match-hq` its `--color-dt-*` override set; since
Phase 12 the room is fully `dt-*` and the neon palette lives entirely in the scoped
variable overrides (gradients included).
`/matches`, `/matches/new`, `/m/[token]`, and the match room `src/components/matches/*`
(`squad-spots`, `squad-groups`, `squad-invite-panel`, `join-battle`, `team-challenge`,
`match-invite-link`, `button-modal`, `player-search`, `match-actions`). Follow
`matchmaking.html` for the room, `friends.html` language for cards/pills.

### Phase 7 — Teams
`/team`, `/team/new`, `/team/[slug]`, `/team/[slug]/edit` + `src/components/teams/*`.

### Phase 8 — Turfs + booking
`/turfs`, `/turfs/[slug]`, turf detail tabs, `turf-booking-calendar.tsx`, booking flow
pages + `/bookings/**` (create-match wizard included). Largest user-facing area; split
into 8a (browse/detail) and 8b (booking + wizard) commits.

### Phase 9 — Map surfaces
`src/components/map/*` (location picker, map pins) — token classes only around the map
chrome; verify MapLibre worker CSS is untouched.

### Phase 10 — Shared primitives (`src/components/ui`)
Now that every consumer is migrated, rewrite the primitives' internals to `dt-*`
(Button variants incl. `loading`, Input, Card, Dialog, Sheet, Tabs, Dropdown, Toast,
Skeleton, Loader wrappers, Pagination, Table, Calendar, Switch/Select/Checkbox/Radio).
**APIs stay identical** — no prop changes. This is safe only after Phases 2–9 because
primitives currently *are* the fallback theme.

### Phase 11 — Turf owner + admin + ERP
`/turf-owner/**` (incl. `erp/**` — bills, expenses, staff, salary sheets, analytics,
reports, premium) and `/admin/**`. Highest component count, lowest design risk (internal
surfaces). Consider 2–3 commits by module.

### Phase 12 — Token removal + cleanup ✅ (done)
- The structural token layer is deleted from `globals.css` (`:root` colors, `@theme`
  mappings for background/card/popover/primary/secondary/muted/accent/border/input/ring/
  chart/sidebar). What deliberately survives:
  - the **status tokens** (`success`/`info`/`warning`/`destructive` + foregrounds) — a
    slim semantic layer used by StatusBadge tones, Button destructive, form errors, and
    banners; floors still asserted in `contrast.test.ts`;
  - `--radius` (Sonner + the radius scale) and the font/radius/shadow/type-scale tokens.
- `.match-hq` keeps only the status-token overrides, the radius bump, and its full
  `--color-dt-*` neon set; the base rule is `border-dt-line outline-dt-green/50`;
  `.maplibregl-popup` and the hero animation use literal hexes.
- Grep gate passes: the mapped token classes return 0 hits in `src/`.
- Delete the semantic token layer from `globals.css` (`:root, .dark` block, `@theme`
  mappings) except what Tailwind itself needs; keep font/radius/shadow tokens if desired.
- Remove retired token assertions from `contrast.test.ts` (palette tests from Phase 1 stay).
- Grep gates: `bg-card|bg-background|text-muted-foreground|border-border|bg-primary|
  text-primary|bg-popover|bg-accent|bg-secondary|bg-muted` return **0 hits** in `src/`.
- Full sweep: `npm run lint && npm run typecheck && npm run test && npm run build`,
  then a manual BN/EN × mobile/desktop pass over every route family.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Visual drift between pages migrated at different times | Palette contract + token→class map appendix; grep for stray token classes at each phase gate |
| Contrast regressions once `--input`/`--border` floors are gone | Phase 1 retargets the contrast test at `dt-*` constants before any removal happens |
| Sonner toasts/portals rendering outside migrated containers | Portals read colors from primitives — toasts keep global styling until Phase 10 |
| Bangla text overflow after spacing/size changes | BN + EN check at 360px every phase (ground rule 2) |
| Half-mixed look during the long tail (Phases 8–11) | Phases ordered user-first; chrome (Phase 2) unifies backdrop early so mixing is less visible |

## Appendix — token → class map (starting point)

| Token class | Raw replacement (friends.html values) |
| --- | --- |
| `bg-background` | `bg-dt-bg` |
| `bg-card` / `bg-popover` | `bg-dt-card` (popover/modal: `bg-dt-bg2`) |
| `bg-muted` / `bg-accent` | `bg-dt-card2` |
| `border-border` | `border-dt-line` |
| `text-foreground` | `text-dt-txt` |
| `text-muted-foreground` | `text-dt-dim` |
| `bg-primary` / `text-primary` | green action: gradient `from-dt-green to-dt-teal text-dt-ink` / accents `text-dt-green` |
| `bg-secondary` | `bg-dt-blue` |
| destructive | `text-dt-red` / `bg-dt-red/10 border-dt-red/30` |
| online / offline dot | `bg-dt-green` / `bg-dt-off` |
| input border | `border-dt-input` (plain dividers stay `border-dt-line`) |
| focus ring / outline | `ring-dt-green/50`, `focus-visible:border-dt-green`, `outline-dt-green/50` |
| status colors | keep the semantic tokens (`text-destructive`, `bg-success/15`, ...) — the one intentional remainder of the token layer |
