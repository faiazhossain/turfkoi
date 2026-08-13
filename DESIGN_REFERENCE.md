# Turfkoi - Design Reference (DreamSports Pattern Mapping)

> Purpose: Map the **DreamSports** football template design to the Turfkoi docs
> (`PROJECT_REQUIREMENTS.md`, `AUDIT_DECISIONS.md`, `PROJECT_OVERVIEW.md`) so the build
> follows this design language consistently.
>
> The DreamSports HTML is treated as the **visual / UX reference**. Implementation follows the
> Turfkoi tech stack unless a decision is made to change it (see Section 1).

---

## 0. Read This First - Decided: Follow the Design, Keep the Stack

**Decision (settled):** Take the DreamSports **visual and UX design patterns** and implement
them in the **already-decided Turfkoi stack** from `PROJECT_REQUIREMENTS.md`
(Next.js App Router + TypeScript + Tailwind + shadcn/ui + Framer Motion). The template's
Bootstrap + jQuery plumbing is **not** adopted - only its look, layout, and interaction
patterns are.

The design language transfers cleanly because shadcn/Tailwind already cover every template
plugin, and lucide-react matches the template's feather icons almost 1:1.

How each DreamSports element is realized in the Turfkoi stack:

| Design element (DreamSports) | Built in Turfkoi with |
|---|---|
| Bootstrap grid + custom CSS | Tailwind utility classes + design tokens |
| jQuery interactions | React Server Components + Server Actions |
| Slick carousel | Embla Carousel (shadcn) |
| Flatpickr date picker | react-day-picker (shadcn Calendar) |
| Select2 dropdowns | shadcn Select / Combobox |
| Fancybox lightbox | shadcn Dialog |
| GSAP / Wow / AOS animations | Framer Motion |
| Feather icons | lucide-react (already in spec, Section 12) |

So: anywhere this doc says "build it," it means build the **DreamSports visual pattern** using
the **Turfkoi stack** above.

---

## 1. Visual Identity - How DreamSports Aligns With PROJECT_REQUIREMENTS Section 11

The DreamSports design is a **sports-tech, football-themed, dark, energetic** aesthetic. This
closely matches the direction already stated in Section 11 ("sports-tech + gaming aesthetic,
premium, energetic, competitive, dark-first").

| DreamSports cue | Turfkoi equivalent (Section 11) | Match |
|---|---|---|
| Dark background (`theme-2`) | `bg #080B10`, `card #11161D` | Strong - keep the dark palette |
| Football green accent on CTAs | `primary #00E676` | Strong - the green "Book" buttons map directly |
| Purple secondary accents | `secondary #7C5CFC` | Strong |
| Big stroked headline type ("OWN THE PITCH") | H1 40/48 desktop, 28/36 mobile | Match Section 13 scale |
| Football imagery + pitch motifs | football/stadium imagery (Section 11) | Strong |
| Calm, trustworthy booking area | "Payment/booking flows must remain calm" (Section 11) | Strong |

**Tagline translation:** The DreamSports headline "OWN THE PITCH" maps to the Turfkoi tagline
"Book a turf. Find an opponent. Find missing players. Play." Lead with action verbs, dark
canvas, green primary CTA.

---

## 2. Section-by-Section Map (Template -> Turfkoi -> Doc Reference)

This is the core reference. Each row says what the template section becomes in Turfkoi and
which section of `PROJECT_REQUIREMENTS.md` governs it.

| # | DreamSports section | Turfkoi screen / feature | Requirements ref | MVP? |
|---|---|---|---|---|
| 1 | Header mega menu (Home/Coaches/User/Pages/Blog/Contact) | Role-aware top nav + mobile bottom nav | Section 7, 44 | MVP |
| 2 | Hero "OWN THE PITCH" + stat counters + 2 CTAs | Public home / marketing hero + trust stats | Section 7, 18 | MVP |
| 3 | Marquee (BOOK COURTS ONLINE...) | Optional marketing strip | - | Optional |
| 4 | Court booking tabs + booking form | Turf discovery + slot selection + booking summary | Section 25, 27, 28 | MVP |
| 5 | "What we offer" 3 feature cards | Feature highlights (Book / Match / Fill players) | Section 2, 4 | MVP |
| 6 | Tournaments carousel | Team-vs-team match discovery + match cards | Section 22, 23 | MVP |
| 7 | Video section (play button) | Marketing / how-it-works | Section 7 | Optional |
| 8 | About Us | Static about page | Section 7 | MVP |
| 9 | Scorecards (match results, scorers, FT/HT/Live) | Match results + player/team history | Section 23, 34 | MVP* |
| 10 | Coaches grid (verified, ratings, price/session) | Player / team profile cards (coaches = Post-MVP) | Section 34, 21 | MVP / Post-MVP |
| 11 | "Matches" community message | Solo player discovery ("teams needing players") | Section 18, 20 | MVP |
| 12 | Testimonials (3 cards) | Reviews (Post-MVP) | Section 65 | Post-MVP |
| 13 | "Ready to Play?" CTA band | Conversion CTA | Section 7 | MVP |
| 14 | Blogs (3 article cards) | Static content / blog | Section 7 | Optional |
| 15 | Footer (about, quick links, locations, contact) | Global footer | Section 7 | MVP |

`*` Scorecards: storing match scores needs Audit row **F1** (add `home_score`, `away_score`,
`result_status`) to be approved before this can be built.

---

## 3. Component Pattern Library (What to Reuse)

These are the reusable visual patterns from DreamSports, each with the Turfkoi/shadcn way to
build it and the governing requirements section.

### 3.1 Court/Turf booking card with tabs
- **Template pattern:** Left column = list of courts (name, location, surface, format) with an
  availability badge; Right column = contextual booking form that swaps per selected court.
- **Turfkoi build:** Tabs or a master-detail layout. Badge states map to slot status (Audit
  row **F8**: `available / held / booked / maintenance / blocked`).
- **Ref:** Section 25 (Slot Management), Section 27-28 (Booking), Section 16 (mobile: vertical
  time list, not grid).

### 3.2 Booking form (Name, Phone, Date, Format, Time slots, Total, Confirm)
- **Template pattern:** Flatpickr date, Select2 format dropdown, radio time-slot grid with
  `disabled` states, sticky total + Confirm button.
- **Turfkoi build:** react-hook-form + zod (Audit row **G7**), shadcn Calendar, shadcn Select,
  radio time slots. **Use a single payer in MVP** (Audit row **B5** - no payment split).
- **Ref:** Section 28 (Booking Flow fee breakdown), Section 45 (Forms), Section 29 (Payment).

### 3.3 Availability / status badges
- **Template pattern:** "Available" (green) and "Busy 6PM-8PM" (danger) badges on court cards.
- **Turfkoi build:** `StatusBadge` component (Section 12 inventory). Pair color with text/icon
  (Section 17 accessibility - never color alone).

### 3.4 Tournament / match carousel cards
- **Template pattern:** Image header + tag (Elite/Amateur/Open), date, format, prize pool,
  venue, "Slots filled x/y" progress bar, Register Team button.
- **Turfkoi build:** `MatchCard` (Section 12). The "slots filled" progress bar is a good fit for
  roster fill visibility (Section 20, 22). Match state drives the tag (Section 23 state machine:
  OPEN / OPPONENT_FOUND / CONFIRMED / ONGOING / COMPLETED).

### 3.5 Scorecard row (team vs team, scorers, score, status tag)
- **Template pattern:** FT/HT/Live tag, date/venue, two team logos+names, goal scorers,
  scoreline.
- **Turfkoi build:** Match result row. Requires Audit row **F1** fields. Live tag maps to the
  `ONGOING` match state (Section 23).

### 3.6 Coach / profile card (verified badge, stats, price, CTA)
- **Template pattern:** Verified check, experience/students/ratings stats, price per session,
  Book Session.
- **Turfkoi build:** `PlayerCard` / `TeamCard` (Section 12). **Coaches are Post-MVP** - reuse
  the card shape for players and teams instead. Verified badge is useful for turf verification
  (admin approves turfs, Section 35).

### 3.7 Stat counters in hero (48 Courts, 89+ Coaches, 12+ Players)
- **Template pattern:** Large animated counters as social proof.
- **Turfkoi build:** Reuse for KPI tiles on the Turf Owner dashboard (Section 26: today's
  revenue, today's bookings, occupancy %) and Admin overview (Section 35).

### 3.8 Sticky primary CTA
- **Template pattern:** Prominent green primary buttons throughout.
- **Turfkoi build:** Section 16 mobile rule - sticky CTA at viewport bottom (e.g., "Pay 1,050").
  Keep calm styling in payment flow (Section 11).

---

## 4. Per-Page Adaptation Guide

How the DreamSports layout adapts to the actual Turfkoi routes (Section 7 sitemap).

### Public home (`/`)
- Use DreamSports hero + stat counters + feature cards + CTA band.
- Replace "Coaches" carousel with "Teams needing players" (Section 18, 20).
- Add "Nearby matches" geo-sorted list (Section 18, 32).

### Turf discovery + details (`/turfs`, `/turfs/[slug]`)
- Court booking tabs (Section 3.1 above) become the turf detail + slot picker.
- Show transparent fee breakdown before payment (Section 28).

### Team dashboard (`/team`)
- Tournament carousel pattern -> "Your matches" + "Find opponent" (Section 22).
- Scorecard pattern -> recent results (Section 23).

### Turf owner dashboard (`/turf-owner`)
- Stat counters -> KPI tiles (Section 26).
- "Fill This Slot" is the primary CTA (Section 26) - this is Turfkoi's signature turf-owner
  feature, not present in the template; build it in the same card style.

### Player dashboard (`/app`)
- "PLAY TONIGHT" priority (Section 18) - lead with Find a Game, Nearby Matches, Teams Needing
  Players.

### Admin (`/admin`)
- Tables (Section 46). Mobile converts tables to card lists (Section 10, 16).

---

## 5. Gaps and Differences to Resolve

These are places where the template and the requirements disagree or where the template is
silent. Each needs a conscious choice.

| # | Gap | Template does | Requirements say | Resolution |
|---|---|---|---|---|
| G-1 | Stack | Bootstrap + jQuery | Next.js + Tailwind + shadcn | **Decided:** follow the design, keep the Turfkoi stack (Section 0) |
| G-2 | Mobile-first | Desktop-first, responsive | Mobile-first, Section 9/16 | Rebuild slot picker as vertical list on mobile; bottom nav; bottom sheets |
| G-3 | Auth | Email/password only | Phone + OTP primary (Audit D1) | Add phone OTP screens, not in template |
| G-4 | Payment | None shown (static form) | bKash only in MVP (Audit B6), fee breakdown (Section 28/29) | Build bKash redirect + retry screen (Audit E4) |
| G-5 | Maps | Not present | BariKoi + MapLibre + PostGIS (Section 32) | Add map-based discovery, not in template |
| G-6 | Currency | USD ($200) | BDT / Taka | Replace all $ values with BDT |
| G-7 | Coaches | Full coaches marketplace | Coaches = Post-MVP | Use card pattern for players/teams now; coaches later |
| G-8 | Tournaments | Front and center | Tournaments = Post-MVP (Section 65) | Replace with match discovery (team vs team) |
| G-9 | Reviews | Testimonials shown | Reviews = Post-MVP | Omit or stub |
| G-10 | Contrast | Unknown (CSS external) | WCAG AA, Section 17 | Run contrast audit (Audit row I1) before freeze |

---

## 6. Build Order (Aligns Template Work With Audit-Approved MVP)

Assuming Audit row **A1** (cut MVP ~35%) is approved, implement the DreamSports-derived
patterns in this order:

1. **Design tokens** (Section 11/12): port the dark palette, green primary, type scale,
   spacing. Run contrast audit (Audit I1).
2. **Public home** (hero, stats, features, CTA) - Section 7, 18.
3. **Auth** - phone + OTP (Audit D1/D2) - no template reference, build to spec.
4. **Turf discovery + booking** - tab pattern + slot picker + fee breakdown (Section 25-28).
5. **Payment** - bKash only, with retry screen (Audit B6, E4).
6. **Team + match discovery** - carousel cards + scorecards (Section 22, 23). Needs Audit F1
   for score storage.
7. **Player discovery** - "teams needing players" cards (Section 18, 20).
8. **Dashboards** - KPI tiles (turf owner), tables (admin) (Section 26, 35, 46).
9. **Admin** - approvals, payments, disputes (Section 35, 36).

---

## 7. Decision Checklist

Stack direction is settled (Section 0): follow the DreamSports design in the existing
Next.js + Tailwind + shadcn stack. Remaining items to confirm before coding the UI:

- [ ] Audit row **A1** (cut MVP) approved? Determines what from the template is in scope.
- [ ] Audit row **F1** (match score fields) approved? Needed for scorecards.
- [ ] Audit row **F8** (slot status enum) approved? Needed for booking badges.
- [ ] Audit row **D1/D2** (phone OTP) approved? Auth screens depend on it.
- [ ] Audit row **B6** (bKash only) approved? Payment UI depends on it.
- [ ] Currency = BDT everywhere (G-6).
- [ ] Contrast audit run (Audit I1, G-10).
- [ ] Mobile-first behavior defined for each reused pattern (G-2).

---

*This reference works alongside `PROJECT_REQUIREMENTS.md` (the source of truth) and
`AUDIT_DECISIONS.md` (the open decisions). Where they conflict, the requirements and your
audit decisions win; this doc only describes the visual target.*
