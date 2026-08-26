<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Bangla-First Rule

**Bangla (BN) is the primary product language.** Every visitor gets Bangla by default; English is a secondary option via the navbar `BN | EN` toggle.

## How it works

- Locale lives in the `tk_locale` cookie (`"en"` | default `"bn"`), resolved per request in the root layout via `getLocale()` (`src/i18n/server.ts`). Never read `navigator.language`/`localStorage`.
- Dictionaries: `src/i18n/dictionaries/en.ts` (source of truth, typed) and `bn.ts` (typed `Dictionary = typeof en` — key drift fails typecheck). A parity test enforces matching keys and `{param}` placeholders.
- Server components: `const t = await getT()`; client components: `const { t } = useI18n()`. Interpolation: `t("key", { param })`.
- Server actions return dictionary **key strings** as `error` values (never English sentences); clients render `t(res.error ?? "errors.generic")`.
- Enum labels go through the typed maps in `src/i18n/labels.ts`.
- Page metadata: `buildMetadata({ titleKey, descriptionKey })` from `src/i18n/metadata.ts`.
- Human-facing dates go through `src/lib/format-date.ts` (bn locale support). Money stays in `formatBdt` (৳).

## Rules for every new user-facing string

1. Write the Bangla version first, English second — both land in the dictionaries in the same change. Never ship a user-facing English-only string.
2. Write **natural Bangladeshi product Bangla**, never literal/textbook translation (টার্ফ বুক করুন — not ক্রীড়াঙ্গন সংরক্ষণ করুন).
3. Keep these in English inside Bangla copy where natural: DeshiTurf, bKash, turf, slot, booking, team, player, match (ম্যাচ is also fine), OTP, email, link. Turf formats ("5-a-side", "7v7") stay English in both locales.
4. Currency: `৳` via `formatBdt`; Bangla numerals where natural (৭ দিন), Western digits for amounts/codes/phone numbers.
