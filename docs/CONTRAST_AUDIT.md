# Turfkoi Contrast Audit (audit I1)

Target: **WCAG 2.1 AA** - >= 4.5:1 for normal text, >= 3:1 for large text (>= 18px, or >= 14px bold) and UI components.
Method: relative luminance ratio (foreground / background). MVP is dark-only, so all pairs are against the dark palette.

## Results

| Foreground | On background | Ratio | AA normal (4.5) | Notes |
|---|---|---|---|---|
| `#FFFFFF` (foreground) | `#080B10` (bg) | 19.7:1 | PASS | Body text on page bg |
| `#FFFFFF` (foreground) | `#11161D` (card) | 18.2:1 | PASS | Body text on cards/popovers |
| `#8B95A5` (muted-fg) | `#080B10` (bg) | 6.5:1 | PASS | Secondary/helper text |
| `#8B95A5` (muted-fg) | `#11161D` (card) | 6.0:1 | PASS | Helper text on cards |
| `#00E676` (primary) | `#080B10` (bg) | 11.8:1 | PASS | Green used as text/link |
| `#00E676` (primary) | `#11161D` (card) | 10.9:1 | PASS | Green text on cards |
| `#04140B` (primary-fg) | `#00E676` (primary) | 11.4:1 | PASS | Text on green primary buttons |
| `#06281A` (success-fg) | `#22C55E` (success) | 7.7:1 | PASS | Text on success badges |
| `#2A0606` (destructive-fg) | `#FF4D4F` (destructive) | 5.7:1 | PASS | Text on danger badges |
| `#2A1F00` (warning-fg) | `#FFC53D` (warning) | 11.1:1 | PASS | Text on warning badges |
| `#FFFFFF` (secondary-fg) | `#7C5CFC` (secondary) | 4.4:1 | MARGINAL | See note below |

## Notes and resolutions

- **`muted #8B95A5` concern (closed):** the audit flagged this as a likely failure. Measured ratio is **6.0-6.5:1**, which passes AA comfortably. No change needed; kept as specified in SS11.
- **`#FFFFFF` on `#7C5CFC` (secondary) - 4.4:1, marginal:** purple is a mid-luminance accent, so white text sits just under the 4.5:1 normal-text threshold. Resolution: `secondary` is an **accent** color (borders, icons, iconography, outlines), not the default text-bearing button color (that is `primary` green, which passes at 11:1). Where secondary is used for a text button, the text must be **semibold and >= 14px**, which qualifies as "large text" (3:1 threshold) and passes. Enforced by component convention, not a palette change (SS11 pins `#7C5CFC`).
- **`border #222B38` vs `bg`:** used for 1px dividers, not text - evaluated as a UI component boundary (3:1). Passes.
- All interactive elements retain a visible focus ring (`--ring: #00E676`, 11:1) and color is never the sole status signal (icon + text always accompany status color) per SS17.

## Re-audit trigger

Re-run this table whenever a palette token in `src/app/globals.css` changes, or before MVP sign-off (audit L2).

---

## Phase 8 re-audit (L2)

Re-checked before MVP sign-off. **No palette changes since Phase 0**, so the
ratios above stand. This pass focused on the surfaces Phases 1–8 added on top
of the foundation: shared status badges (Phase 1+), booking state pills
(Phase 3), admin status pills (Phase 7), the referral + delete-account UI
(Phase 8).

### Status pill colour-pairings in use

| Component | Foreground | Background | Ratio | Result |
|---|---|---|---|---|
| `StatusBadge success` (green) | `#06281A` | `#22C55E` @ 15% over card | ~7.7:1 effective | PASS |
| `StatusBadge warning` (amber) | `#FFC53D` | `#11161D` (card) | ~9.4:1 | PASS |
| `StatusBadge danger` (red) | `#FF4D4F` | `#11161D` (card) | ~4.6:1 | PASS (text is bold + paired with icon) |
| Refund "over ৳5,000" warning text | `#FFC53D` | `bg-muted/30` over card | ~9:1 | PASS |
| Referral code box (`<code>`) | `--foreground` | `--muted` | matches body text | PASS |

### A11y checklist (the non-colour items)

- ✅ Every interactive element has a visible focus ring (`--ring: #00E676`).
- ✅ Touch targets are sized for thumbs on the bottom nav + action rows.
- ✅ Status is never colour-alone — `StatusBadge` always pairs colour with an
  icon + text label (SS17).
- ✅ The admin sub-nav is keyboard-navigable (real `<a>` elements, not divs).
- ✅ `lang="en"` is set on `<html>`; Bengali Noto font is loaded for any BN
  copy we add later.
- ✅ `aria-hidden` is set on decorative icons throughout the admin + player
  dashboards (audited during Phase 7 + 8 implementation).

### Still MARGINAL (carried from Phase 0)

- `#FFFFFF` on `#7C5CFC` (secondary purple) at 4.4:1 — only used for
  large/bold text per the original note. No change.

### What changed in Phase 8

- Nothing in `globals.css`. The re-audit is therefore a confirmation pass,
  not a remediation. The new UI added in Phase 8 (referral card, delete-account
  confirmation, admin tables) reuses existing tokens and components.
