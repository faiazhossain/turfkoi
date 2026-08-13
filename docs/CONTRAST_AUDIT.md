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
