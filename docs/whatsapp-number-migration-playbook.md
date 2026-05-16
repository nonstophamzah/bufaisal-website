# Pre-staged WhatsApp number migration — execute if old number gets banned again

**Status:** Pre-staged playbook. As of 2026-05-16, `+971 58 593 2499` is operational. This document lets the same migration be re-executed on short notice if the number is banned again.

**Last validated:** 2026-05-15 — full migration was prepared on branch `claude/nifty-thompson-07d478` against new number `+971 55 881 2411`, then reverted after the original number was unbanned. The file inventory below was verified end-to-end.

---

## When to run this

WhatsApp Business numbers can be banned without warning, breaking every customer-facing CTA on the site at once. If that happens:

1. Obtain a replacement UAE mobile number (must be activated on WhatsApp first — test by sending a message to it from another device).
2. Pick the four format variants you'll need (see "Format variants" below).
3. Execute Steps 1–4 below.

Plan B (faster than full migration): just update `NEXT_PUBLIC_WHATSAPP_NUMBER` in Vercel + the `website_config` DB row. That fixes every `buildWhatsAppUrl()` consumer (homepage Negotiate buttons, product page Negotiate, mobile sticky bar, WhatsApp draft pre-fill) in <2 minutes because they all read the runtime value. The hardcoded surfaces in the file list below — Navbar, Footer, contact page display strings, JSON-LD schema — will continue showing the old number until the full migration runs, but the actual click destinations will be correct.

---

## Format variants

The repo holds four distinct formats of the same number. When migrating, derive all four from the new number:

| Variant | Example (old → new in the validated migration) |
|---|---|
| **Digits only, no plus** | `971585932499` → `971558812411` |
| **With plus prefix** | `+971585932499` → `+971558812411` |
| **International spaced (3-3-4)** | `+971 58 593 2499` → `+971 55 881 2411` |
| **Arabic RTL display (reversed groups)** | `2499 593 58 971+` → `2411 881 55 971+` |

UAE mobile numbers are 9 digits after the country code (`971`); the spacing pattern is `+971 XX XXX XXXX`. The Arabic RTL form reverses the word order of the spaced form (digits within each group are NOT reversed — only the group order).

---

## Step 1 — Code & SQL edits (11 files, 17 occurrences)

All occurrences below are anchored exactly. Do a final `grep -rn "<old-digits>"` after editing to confirm zero misses.

### Customer-facing UI (4 files, 9 occurrences)

| File | Line | Context | Variant |
|---|---|---|---|
| [src/components/Navbar.tsx](../src/components/Navbar.tsx) | 61 | Desktop "Call" pill `tel:` href | `+<digits>` |
| [src/components/Navbar.tsx](../src/components/Navbar.tsx) | 152 | Mobile menu Call `tel:` href | `+<digits>` |
| [src/components/Navbar.tsx](../src/components/Navbar.tsx) | 155 | Mobile menu Call display text — EN + AR RTL | EN spaced + AR RTL |
| [src/components/Footer.tsx](../src/components/Footer.tsx) | 79 | "Contact Us" `tel:` href | `+<digits>` |
| [src/components/Footer.tsx](../src/components/Footer.tsx) | 83 | "Contact Us" display text | International spaced |
| [src/components/Footer.tsx](../src/components/Footer.tsx) | 86 | "Contact Us" WhatsApp `wa.me` link | Digits only |
| [src/app/marketplace-client.tsx](../src/app/marketplace-client.tsx) | 94 | Marketplace header WhatsApp circle button | Digits only |
| [src/app/marketplace-client.tsx](../src/app/marketplace-client.tsx) | 231 | Marketplace footer "Contact" link | Digits only |
| [src/app/contact/contact-wa.tsx](../src/app/contact/contact-wa.tsx) | 9 | "Message Us on WhatsApp" green button pre-fill | Digits only (in `wa.me/<digits>?text=...`) |

### Contact page (1 file, 2 occurrences)

| File | Line | Context | Variant |
|---|---|---|---|
| [src/app/contact/page.tsx](../src/app/contact/page.tsx) | 27 | "Call Us" card `tel:` href | `+<digits>` |
| [src/app/contact/page.tsx](../src/app/contact/page.tsx) | 28 | "Call Us" display text | International spaced |

### JSON-LD schema (2 files, 2 occurrences)

| File | Line | Context | Variant |
|---|---|---|---|
| [src/app/layout.tsx](../src/app/layout.tsx) | 133 | Organization `contactPoint.telephone` | `+<digits>` |
| [src/lib/local-business-schema.ts](../src/lib/local-business-schema.ts) | 16 | 5-shop LocalBusiness `SHARED.telephone` | `+<digits>` |

### Constants + admin UI hint (2 files, 2 occurrences)

| File | Line | Context | Variant |
|---|---|---|---|
| [src/lib/constants.ts](../src/lib/constants.ts) | 74 | `WHATSAPP_NUMBER` fallback (only used when `NEXT_PUBLIC_WHATSAPP_NUMBER` env unset; powers `buildWhatsAppUrl()` → every Negotiate button + mobile sticky bar + draft pre-fill) | Digits only |
| [src/app/admin/components/AdminSettings.tsx](../src/app/admin/components/AdminSettings.tsx) | 49 | Admin settings field `hint` text — `"Include country code, e.g. <digits>"` | Digits only |

### Seed SQL (2 files, 2 occurrences)

These do **not** affect the live production DB — they're only run on fresh setups. Step 2 below patches the live row.

| File | Line | Context |
|---|---|---|
| [supabase-setup-v2.sql](../supabase-setup-v2.sql) | 55 | `INSERT INTO website_config ('whatsapp_number', '<digits>')` |
| [supabase/migrations/002_setup-v2.sql](../supabase/migrations/002_setup-v2.sql) | 55 | Same row, same content (duplicated migration) |

---

## Step 2 — Production database (run in Supabase SQL editor)

The live `website_config.whatsapp_number` row is the runtime source for `buildWhatsAppUrl()` (via `NEXT_PUBLIC_WHATSAPP_NUMBER` when that env override is unset; the env wins if set).

```sql
UPDATE website_config
SET config_value = '<NEW-DIGITS-ONLY>'
WHERE config_key = 'whatsapp_number';

-- Verify
SELECT config_value FROM website_config WHERE config_key = 'whatsapp_number';
```

Replace `<NEW-DIGITS-ONLY>` with the digits-only variant of the new number (e.g. `971558812411`).

---

## Step 3 — Vercel environment variable

If `NEXT_PUBLIC_WHATSAPP_NUMBER` is set in the Vercel project (Production environment), it **overrides** the DB value and the `constants.ts` fallback. Check + update:

1. Vercel dashboard → `bufaisal-website` → Settings → Environment Variables.
2. Find `NEXT_PUBLIC_WHATSAPP_NUMBER`. If present, update its value to the digits-only variant.
3. Redeploy (or wait for the next deploy) — env var changes are not picked up by existing builds.

If the variable does NOT exist in Vercel, no action needed — the DB row + `constants.ts` fallback handle it.

---

## Step 4 — PR + verification

```bash
# Sanity check: zero remaining occurrences of the OLD number
grep -rn "<old-digits>\|<old-spaced>\|<old-arabic>" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --include="*.json" --include="*.sql" --include="*.mjs" .

# Commit + PR
git add <11 files above>
git commit -m "chore: update WhatsApp number to <new-spaced>"
gh pr create --title "Update WhatsApp number to <new-spaced>"
```

After merge + Vercel redeploy + DB update:

- [ ] Visit `/`, `/shop`, `/item/[id]`, `/contact` — every WhatsApp + tel link points to new number
- [ ] Click a product Negotiate button (desktop + mobile) → confirm WhatsApp opens chat with new number
- [ ] View page source on `/item/[id]` → Organization + LocalBusiness JSON-LD telephone fields show new number
- [ ] Toggle to Arabic in Navbar mobile menu → confirm RTL display reads `<new-arabic>`
- [ ] Admin Settings → confirm hint reads `e.g. <new-digits>`

---

## What is intentionally NOT touched

These should **not** be edited as part of the migration:

- **`/appliances` and `/api/appliances`** — internal ops system, zero customer-facing WhatsApp references.
- **`.env.example`** — contains the placeholder `971501234567`, not a real number.
- **`CLAUDE.md`** — does not quote the number.
- **`docs/phase-7-pr54-audit.md`** — frozen historical audit of the JSON-LD output as it existed at PR #54 merge time. Updating it would falsify the historical record.
- **`docs/phase-7-handoff.md`** + **`docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md`** — these forward-looking docs DO mention the number once each. Update them in the same PR if you want the docs to match reality; they're not load-bearing for the migration itself.

---

## Rollback

If the new number is later unbanned and the old one is reactivated:

1. Revert the merge commit (`git revert <sha>` on `main`, or open a "Revert <PR-title>" PR via GitHub UI).
2. Re-run Step 2 with the old digits.
3. Re-run Step 3 with the old digits (or unset the env var entirely if the `constants.ts` fallback is the desired source).
