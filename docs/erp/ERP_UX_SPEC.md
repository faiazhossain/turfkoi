# DeshiTurf ERP — Information Architecture & UX Specification

Dark-first design system, Base UI kit, mobile-first. Reuses: `KpiTile`, `EmptyState`,
`StatusBadge`, `Sheet` (mobile bottom sheets), `Button loading`, `LoaderOverlay` (`loading.tsx`),
`AdminSubNav` pattern for ERP nav. All copy BN-first, natural Banglish (keep turf, slot,
booking, staff, bill, rent, bKash in English inside Bangla).

---

## 1. Information architecture

```
turf-owner (existing dashboard — unchanged; + one "ব্যবসা" nav card/link)
└── /turf-owner/erp                    layout.tsx: role guard + ErpSubNav + trial banner slot
    ├── /          Overview (business command center)
    ├── /income    Income (booking revenue auto + other income manual)
    ├── /expenses  Expenses (list + quick add; categories inline)
    ├── /profit    Profit (this-month P&L, traceable breakdown; range picker = premium)
    ├── /staff     Staff (list → [id] profile)
    │   └── /salaries      Salaries (month grid → record payment)
    ├── /bills     Bills & recurring (upcoming first; rent contract card at top when present)
    ├── /maintenance  Maintenance log
    ├── /analytics Analytics (premium previews on free)
    ├── /reports   Reports (basic monthly free; P&L/CSV premium)
    └── /settings  ERP settings (categories, targets, alert prefs, trial/plan status)
```

Deferred (Phase 3+): `/cashflow` (inside Profit as a tab until then), `/goals` (inside
Settings → targets, then surfaces on Overview), `/budgets`.

**Turf scope switcher** in ERP layout header: `All Turfs ▾ / Mirpur Turf / …` — server-driven
via `?turf=` param, options from `listMyTurfs`. Persisted per-owner preference later.

## 2. Overview (command center)

**Desktop:** max-w-6xl container (matching owner dashboard), KPI grid 4-across.
**Mobile:** 2-across KPI grid, horizontal-scroll alerts row, sticky bottom quick-add FAB.

- **Money KPIs (always):** আজকের আয় (booking, auto) · এই মাসের আয় · এই মাসের খরচ · এই মাসের লাভ
  (লাভ value tints success/destructive; tap → /profit)
- **Business KPIs (second row):** bookings this month · occupancy % (reuse `getOwnerKPIs` logic) · average booking value · pending payments (bills+salaries due)
- **Alerts strip:** up to 3, from server (bill due ≤3d, salary pending, expense spike ≥15% MoM — spike alert is premium). Each → relevant page. Uses `StatusBadge` semantics.
- **Insight card (1):** best day/period from booking data, e.g. "শুক্রবার সন্ধ্যায় আপনার সবচেয়ে বেশি আয়।" Free tier gets one; the full analytics pack is premium.
- **Quick actions:** খরচ যোগ করুন (Sheet form) · আয় যোগ করুন · Staff যোগ করুন · Salary দিন · Bill যোগ করুন · Report দেখুন
- **Empty state (first visit):** progressive onboarding card sequence (see §6).

## 3. Page specs (essentials)

### Income
Split sections: **Booking আয়** (auto table/cards: date, turf, bookings count, gross, platform fee, net; explanation line "DeshiTurf fee বাদে আপনার আয়") and **অন্য আয়** (manual: direct match/booking fee, tournament fees, etc. — form states "এই টাকা DeshiTurf booking ছাড়া আয়, যেমন match fee"). Month picker at top. Empty states teach.

### Expenses
Filter chips: month + category. Card list (mobile) / table (desktop): date, category badge, note/vendor, amount, void action (archive/void, not delete). **খরচ যোগ করুন** → Sheet form: amount (৳, numeric keypad), category (preset chips: ভাড়া, বিদ্যুৎ, পানি, ইন্টারনেট, staff salary, cleaning, maintenance, equipment, marketing, security, অন্যান্য), date (today default), turf (scope default), note optional, "প্রতি মাসে" repeat toggle → creates recurring rule (free: ≤3 active). Submit = server action, button `loading`, error via `t(res.error)`.

### Profit (লাভ)
Hero number: **এই মাসের লাভ ৳82,450** — tap expands the traceable breakdown:

```
আয় (booking)        ৳1,45,000
অন্য আয়                ৳8,000
Refund                 −৳5,000
খরচ (মোট)            −৳57,550
─────────────────────────────
লাভ                  ৳90,450
```

Every line links to its source list. Month selector; custom-range picker marked premium with preview lock card. Cash-flow tab (Phase 3) = same math grouped in/out over time.

### Staff
Cards (mobile-first): name, position badge, phone, salary type + amount, status. ≤5 active on free with counter ("৩/৫ staff — Premium-এ unlimited"). Profile page: details + salary history + "Salary দিন".

### Salaries
Month grid: each staff row → payable (base free-tier; +allowance/overtime/bonus/deduction/advance premium), paid, status (`StatusBadge`: paid/partial/pending). Record payment Sheet: amount (validated ≤ payable unless "অগ্রিম" flag), method (cash/bKash/Nagad/bank), date, reference, note. On save → creates expense under staff salary category automatically (single flow into Finance) + audit row.

### Bills
"আসন্ন" section first (next 30 days, due-date ordered, days-remaining chip); then recurring rules list; then one-off bills history. Rule form: name, category, amount, frequency (monthly/quarterly/yearly), next due date. "Paid" button marks paid → posts expense + schedules next occurrence. **Rent card** pinned when a contract exists: monthly amount, landlord, agreement dates, deposit, next due; "রেন্ট যোগ করুন" creates contract + monthly recurring rule in one guided form.

### Maintenance
Log list (date, category, turf, cost, vendor, status). Form includes optional **"slot block করুন"** toggle → deep-links into the existing day panel to block `maintenance` slots (reuses slot system; ERP never creates its own availability logic).

### Analytics (premium; free = preview locks)
Sections: Revenue (by day/day-of-week/hour, avg booking value trend) · Expenses (category trend, fixed vs variable) · Turf performance (per-turf revenue/profit/occupancy comparison — multi-turf consolidated is premium) · Customers (repeat %, top customers by bookings — masked phone) · Staff cost. Filters: period presets + custom range. Locked cards show: what it does, why it matters, sample blurred chart, `See Premium Features`.

### Reports
Free: current monthly summary (printable). Premium: P&L any range, revenue/expense/staff-cost/customer reports, CSV export button (server-generated). Print stylesheet: white background, compact header.

### ERP Settings
Categories (view system, add custom = premium), targets (monthly revenue/expense/profit = premium budgeting), alert preferences, trial/plan status card (days left, what changes after), danger zone: void-history view.

## 4. Key user flows

1. **First ERP entry** → overview with onboarding sequence (§6) → step 2 (rent+electricity quick form, one screen, two amounts) → step 3 (staff: name+phone+salary, repeatable) → step 4 (target — skippable, premium anyway → shows "পরে করব") → dashboard now shows real লাভ.
2. **Add expense** anywhere → FAB / quick action → Sheet → 4 fields max → save → KPI updates via `router.refresh()`.
3. **Pay salary** → alert "২ জন staff-এর salary বাকি" → salaries page → staff row → Sheet → amount prefilled payable → save → expense auto-posted + notification confirms.
4. **Bill lifecycle** → rule created → upcoming appears → due alert ≤3d → "Paid" → expense posted → next due auto-scheduled.
5. **Premium upgrade** → locked card → upgrade sheet (feature list, price, "Admin-এর সাথে যোগাযোগ করুন" until billing rail exists) → admin grants → premiumUntil set → features unlock with welcome insight.

## 5. Trial & premium UX

- Trial banner (ERP layout top, dismissible per day): "আপনার ERP trial চলছে — আরও ৩৮ দিন।" Turns warning-style at ≤7 days with "trial শেষ হলে কী কী free থাকবে" link.
- Day-1 card: introduce ব্যবসা module; week-1 nudges contextual (no rent recorded → rent CTA; no staff → staff CTA).
- Locked feature card pattern: icon + title + one-line value + what you'd gain + `🔒 Premium` badge + [See Premium Features]. No interstitials, no crippled free data, no countdown pressure.

## 6. Empty states (teach the value)

| Context | Title | Body | CTA |
|---|---|---|---|
| Expenses | এখনো কোনো খরচ যোগ করা হয়নি | আপনার ভাড়া, বিদ্যুৎ, staff salary বা অন্য খরচ যোগ করলে আমরা আপনার আসল লাভ দেখাতে পারব | খরচ যোগ করুন |
| Staff | আপনার turf-এর staff যোগ করুন | Staff salary হিসাব করলে মাসের আসল লাভ বুঝবেন | Staff যোগ করুন |
| Salaries | এই মাসে কারো salary দেওয়া হয়নি | Staff যোগ করলে এখানে monthly salary দেখাবে | Staff যোগ করুন |
| Bills | কোনো bill নেই | বিদ্যুৎ, ইন্টারনেট, ভাড়া — একবার যোগ করলেই প্রতি মাসে মনে করিয়ে দেব | Bill যোগ করুন |
| Forecast (premium) | আরও কিছু ডেটা জমলে আমরা আপনার ব্যবসার পূর্বাভাস দেখাতে পারব | — | — |

## 7. Mobile behaviors

- Quick-add forms: `Sheet` from bottom, full-width, large inputs (৳ amount uses `inputMode="decimal"`), primary action pinned at sheet bottom with `loading` state.
- Tables become stacked cards below `sm`.
- ERP sub-nav: horizontally scrollable (AdminSubNav pattern), icon+label.
- KPI grid: 2-col; hero লাভ card full-width.
- All list pages server-rendered with `loading.tsx` skeletons (`LoadingState`); mutations keep disable-on-pending; every async state terminates on success/error/navigation/unmount per project loading rules.
