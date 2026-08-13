# Turfkoi - The Whole Thing Explained Simply

> This is a plain-language summary for anyone. No tech background needed.

---

## What Is Turfkoi?

Turfkoi is an app/website for **booking football turfs (fields) in Bangladesh** and for **finding people to play with**.

It is built for the local market: prices in Taka (BDT), payments through bKash/Nagad, and showed in maps.

The tagline says it all:

> _Book a turf. Find an opponent. Find missing players. Play._

The big idea that makes Turfkoi different from other turf-booking sites is **matchmaking**. Most sites stop at "here is a field, book it." Turfkoi goes further: it helps you find an opposing team, fill empty roster spots with solo players, confirm the match, and record the result. It closes the loop from _"I want to play tonight"_ to _"match confirmed."_

---

## The Problem It Solves

Three groups of people each have a headache today:

| Who              | Their Problem                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Solo players** | Want to play but have no team, no field, and no easy way to find a game nearby.                           |
| **Teams**        | Book a field but then scramble on WhatsApp to find an opponent or 1-2 extra players. Games get cancelled. |
| **Turf owners**  | Have empty time slots earning nothing and no good way to fill them at the last minute.                    |

Right now this all happens over phone calls and WhatsApp groups, which is messy, slow, and unreliable.

**Turfkoi brings all of it into one place.**

---

## Who Uses It (The Four Roles)

A single person can be more than one role at once (for example, you might own a turf AND captain a team AND play as a player). One login, many hats.

1. **Player** - wants to find a game tonight and join.
2. **Team / Team Owner** - books fields, finds opponents, fills the roster.
3. **Turf Owner** - lists their field, sets time slots and prices, fills empty slots.
4. **Admin** - runs and polices the whole platform (approves turfs, handles disputes, watches payments).

---

## How It Makes Money

Simple and transparent:

- **Turf owners pay nothing** to list. This gets as many turfs on the platform as possible.
- The **booker pays a small platform fee** of about 5% (capped around 100 Taka).

Example:

| Item                    | Amount    |
| ----------------------- | --------- |
| Turf price              | 1,000     |
| Platform fee (about 5%) | 50        |
| **Booker pays total**   | **1,050** |
| Turf owner receives     | 1,000     |
| Turfkoi receives        | 50        |

The fee is always shown **before** payment and is **locked** the moment payment starts - it can never be secretly changed afterward. This builds trust.

(Bigger money-makers like subscriptions, promotions, and tournaments are planned for later, not the first version.)

---

## The Full Flow - Step by Step

Here is what actually happens, in plain words.

### The Team Journey (the main path)

1. A team **registers** and creates their team profile.
2. They **find a turf** and pick an open time slot.
3. They **book** the slot (this is where the fee and payment happen).
4. They **create a match** and start looking for an opponent.
5. Another team **accepts** the challenge.
6. If they are short of players, they **look for solo players** to join as guests.
7. Solo players **request to join**, the captain **approves**.
8. Everyone **plays** the match.
9. The result is **recorded**, and the match becomes part of each player's history.

### The Solo Player Journey

1. A player **registers** and sets up a simple profile (position, skill level, area).
2. They open the app and see **nearby matches that need players**.
3. They **tap "Request to Join."**
4. The captain **accepts or rejects**.
5. If accepted, the player joins that one match as a **guest**.
6. After playing, they can optionally **join the team permanently**.

> Important rule: being a guest for one match does NOT make you a permanent team member. Guest and member are kept strictly separate.

### The Turf Owner Journey

1. The owner **lists their turf** (photos, location, facilities, type like 5v5 or 7v7).
2. They **set up time slots and prices**.
3. They **receive bookings** and get notified.
4. Their dashboard shows **today's revenue, upcoming bookings, and empty slots**.
5. The killer feature: **"Fill This Slot"** - for an empty slot tonight, the platform helps find teams or promote the slot so it does not go to waste.

---

## How the Match Moves Through Stages

Every match follows a clear path, like a tracked package:

```
Draft -> Open (looking for opponent)
      -> Opponent Found
      -> Payment Pending
      -> Confirmed (paid)
      -> Building Roster
      -> Ready
      -> Ongoing (kick-off)
      -> Completed (result submitted)
```

Matches can also be **Cancelled** or, if something goes wrong, put into **Disputed** for an admin to resolve.

---

## What the Two Files in This Folder Are

There are two original documents. Here is what each one does.

### 1. PROJECT_REQUIREMENTS.md - The Blueprint

This is the **master plan** for the whole project. It is long and technical because it is meant for developers. It decides everything: product vision, user roles, screen layouts, color scheme, database tables, how payments work, security rules, how the app gets deployed, and more.

Think of it as the **full architectural drawing** before a house is built. It covers about 70 sections, including:

- What the product is and who it is for
- The user journeys and match flow described above
- Mobile-first design (phones first, big screens second)
- How bookings and payments work without double-charging anyone
- The database structure behind the scenes
- Security, privacy, testing, and launch plan

### 2. AUDIT_DECISIONS.md - The Review and Suggested Changes

This is a **critique of the blueprint**. Someone read the master plan carefully and found gaps, contradictions, and missing decisions, then wrote up a list of suggested fixes.

Each suggestion is a row you can mark as **Approve / Reject / Defer**, with a note on what changes if approved.

The main themes it flags:

| Area                 | What It Says Is Missing or Needs Fixing                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**            | The first version is too big. Cut it down by about 35% so it can launch faster. Pick one way to get the first users on board.                                       |
| **Money flow**       | No cancellation policy, no refund policy, no plan for paying turf owners, no dispute process. These are the riskiest gaps.                                          |
| **Contradictions**   | Two parts of the blueprint disagree on whether you pay before or after finding players. Needs to be reconciled.                                                     |
| **Login**            | Should use phone number + OTP code (Bangladesh users prefer phones), not just email/password.                                                                       |
| **Data**             | Need fields to store match scores and player history; need extra tables for holds, cancellations, and payouts.                                                      |
| **Tech tools**       | Must pick specific providers: Neon for database, Drizzle for migrations, Inngest for background jobs, Pusher for realtime, Upstash Redis for caching/rate-limiting. |
| **Security**         | Need a proper threat model, tamper-proof audit logs, and tighter refund controls.                                                                                   |
| **Launch readiness** | Need backup plans, alerting, and an account-deletion process before going live.                                                                                     |

It ends with **10 open questions** that must be answered before coding starts (for example: how long is the free-cancellation window? how often are turf owners paid? do we ship light mode now or later?).

---

## The Short Version

- **What is it?** A Bangladeshi app to book football turfs and find people to play with.
- **Problem?** Players, teams, and turf owners all struggle to connect; everything happens over phone and WhatsApp.
- **Solution?** One platform that books the field, finds the opponent, fills the roster, takes payment, and records the result.
- **Money?** Turf owners list free; the booker pays a small, transparent, locked-in fee.
- **The two files?** One is the full blueprint for building it; the other is a review pointing out what to fix before building starts.

---

_This summary covers PROJECT_REQUIREMENTS.md and AUDIT_DECISIONS.md in plain language. For full technical detail, refer to those files directly._
