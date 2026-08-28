# DeshiTurf ERP — Product Requirements Document

Module name (BN-first): **ব্যবসা (Business)** — nav label `ব্যবসা`, route `/turf-owner/erp`.
Rationale for "ব্যবসা" over "ERP": turf owners don't say "ERP"; "ব্যবসা" is the word they use
for this exact mental model ("আমার ব্যবসা কেমন চলছে?"). English label: "Business".

---

## 1. Problem

DeshiTurf owners run real businesses with rent, staff salaries, electricity bills and
maintenance — but the platform only shows them booking revenue. They cannot answer:
"আজ/এই মাসে আমার লাভ কত?" They track this in notebooks or not at all. That gap limits
retention: once a competitor shows an owner his profit, DeshiTurf is just a booking channel.

## 2. Users

- **Primary:** turf owner (single turf, phone-first, cash-comfortable, non-accountant).
- **Secondary (future):** manager/accounting staff delegated by the owner — out of scope for MVP, but data model keeps `ownerId` isolation so delegation can be added without migration pain.
- **Admin:** support/oversight via existing admin bypass.

## 3. Jobs to be done

1. "আমার আয়-খরচ এক জায়গায় দেখি" — record what the platform can't know.
2. "লাভ কত?" — automatic profit from booking revenue minus recorded costs.
3. "কোথায় টাকা যাচ্ছে?" — expense breakdown by category.
4. "কাল কী দিতে হবে?" — upcoming bills, salaries, rent.
5. "ব্যবসা বাড়ছে না কমছে?" — trends, comparisons, forecasts (premium).

## 4. Goals

- Owner can go from first ERP visit to seeing real profit in < 5 minutes (onboarding: rent + electricity + one staff).
- Booking revenue appears with zero owner effort (pure aggregation).
- Weekly active ERP usage becomes a habit via alerts (bills/salaries) — the retention engine.

### Non-goals (MVP)

- Formal accounting (double-entry, ledgers, VAT/tax reports).
- Payment collection for salaries/bills through DeshiTurf.
- Manager/staff-role logins to ERP.
- AI assistant (Phase 4; needs premium infra).
- Invoice attachments (post-Phase 2).

## 5. Free vs Premium — feature matrix

Principle: **free tier must fully answer the five core questions for a single-turf owner**
(কত আয় / কত খরচ / কত লাভ / কোথায় যাচ্ছে / কেমন চলছে). Premium sells scale, foresight, and
automation — the things that matter once the basics are a habit.

| Capability | Free | Premium |
|---|---|---|
| ERP dashboard (money + business KPIs, alerts) | ✅ | — |
| Booking revenue aggregation (auto) | ✅ | — |
| Manual expense entry, system categories | ✅ | — |
| **Custom expense/income categories** | — | ✅ |
| Basic monthly summary (revenue/expense/profit) | ✅ | — |
| Staff list (≤ 5 active staff) | ✅ | Unlimited |
| Record monthly salary payment (base only) | ✅ | — |
| **Full payroll** (allowance/overtime/bonus/deduction/advance, partial payments, salary history) | — | ✅ |
| Recurring monthly rent/bill reminders | ✅ (up to 3 rules) | Unlimited |
| Rent contract record (landlord, deposit, dates) | ✅ | — |
| Maintenance cost log | ✅ | — |
| **Cash-flow view** | — | ✅ |
| **Profit & Loss report** | Current month only | Any range, printable |
| **Advanced analytics** (peak hours, per-turf comparison, YoY, revenue/slot/hour) | — | ✅ |
| **Customer intelligence** (repeat customers, top customers, retention) | — | ✅ |
| **Budgeting & monthly goals** (targets + pacing) | — | ✅ |
| **Forecasting** (revenue/expense/profit, clearly labeled অনুমান) | — | ✅ |
| **Multi-turf consolidated reporting** (per-turf view stays free) | — | ✅ |
| **CSV export** | — | ✅ (PDF post-MVP) |
| **DeshiTurf Business Assistant (AI)** | — | ✅ (Phase 4) |
| Financial alerts (bill due, salary pending) | ✅ | — |
| Trend/change alerts (expenses +18%, occupancy −12%) | — | ✅ |

**Monetization logic**

- *Immediate value (free):* auto revenue + expenses + profit — creates activation and the "wow, DeshiTurf knows my business" moment. Locking these would kill adoption.
- *Habit (free):* alerts + basic dashboard = daily open reason.
- *Worth paying for (premium):* payroll depth, foresight (forecast/goals), comparative intelligence (peak hours, multi-turf, YoY), and exports — features an owner wants once the business is genuinely being run through DeshiTurf.
- *Paywall ethics:* locked views show what the feature does, a blurred/preview sample, and the gain — never nag-walls or crippled free data.

## 6. Trial

- **2 months free Premium-equivalent**, starting from the owner's platform lifecycle date:
  `MIN(turfs.createdAt)` across owned turfs (authoritative for both claim-flow and self-created owners).
- Banner stages: Day 1 intro → week 1 setup nudges (rent/electricity/staff) → insights →
  final 7-day warning listing what stays free vs becomes premium.
- No dark patterns; no card capture (no billing rail exists — see Open decisions).
- After trial: free tier per matrix above; premium features become upgrade previews.

## 7. Success metrics

Activation: % owners opening ERP within 7 days of claim · % recording ≥1 expense in week 1 ·
% adding ≥1 staff · onboarding completion rate.
Engagement: weekly ERP-active owners · alert click-through · expense records/owner/month.
Monetization: trial→paid conversion · premium MRR (once billing exists).
North star: **90-day owner retention on DeshiTurf, ERP users vs non-users.**

## 8. Open decisions (owner input needed before build)

1. **Premium billing rail** — MVP proposal: admin grants premium manually (`erp_profiles.premiumUntil`); bKash subscription integration later. Acceptable?
2. **Free staff cap (5)** — right number?
3. **AI assistant** — defer entirely to Phase 4, or ship a non-AI "insights" pack in Phase 3 first?
4. **Naming** — confirm `ব্যবসা` vs `ব্যবসা পরিচালনা` for the nav item.
