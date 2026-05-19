# HANDOFF — PHASE 8 PR 1 COMPLETE
**Session date:** May 14, 2026
**For:** next Claude chat picking up after this work
**Read alongside:** docs/phase-7-handoff.md (Phase 7 + this together = full ground truth)

---

## WHAT JUST SHIPPED

### ✅ PR #57 — Admin override inputs: price + negotiable + condition_grade
**Branch:** `phase-8/pr1-admin-price-negotiable-grade` (merged to main)
**Diff:** +922 / -42, 11 files, 2 commits

**The gap this closed:** Phase 1B created admin override columns (`admin_price_aed`, `admin_negotiable`, `admin_condition_grade`) but the `/admin/pending` detail editor never exposed UI inputs for them. Backend, validator, eligibility logic all wired; only `<input>` elements missing. SQL-confirmed: 0 of 16 Phase 5+ approvals had ever used these fields, because admins literally couldn't.

**What got built:**

1. **UI inputs in `/admin/pending/[id]`:**
   - Price input (integer AED) → `admin_price_aed`
   - Negotiable Yes/No pills → `admin_negotiable`
   - Condition Grade Excellent/Good/Fair pills → `admin_condition_grade` (only on `worker_condition_type === 'Used'`, replaces the legacy `<select>`)
   - All three default to effective value (`admin_* ?? worker_*`), clear via "Worker submitted: X — Reset" affordance
   - Inserted directly below Item Name, above Category/Product Type
   - New `AdminPill` subcomponent

2. **6 public-site surfaces switched to fallback chain:**
   New helper `src/lib/effective-fields.ts::getEffectivePrice(item)` chains `admin_price_aed ?? worker_price_aed ?? sale_price`. Applied to:
   - `src/app/item/[id]/item-detail-client.tsx` (SimilarItemCard + main detail)
   - `src/app/marketplace-client.tsx` (homepage grid)
   - `src/app/shop/page.tsx` (ItemList JSON-LD `offers.price`)
   - `src/components/ItemCard.tsx` (shared card)
   - `src/app/api/feed/route.ts` (Facebook + Google feeds)
   - `src/lib/constants.ts` (`buildWhatsAppUrl()`)
   
   Analytics calls (`trackViewContent`, `trackWhatsAppClick`) intentionally stay on legacy `sale_price` per CLAUDE.md "non-display reads stay on legacy fields" rule.

3. **Type additions:** `ShopItem` interface in `src/lib/supabase.ts` gained `worker_price_aed` + `admin_price_aed` (both columns existed in DB, were missing from the type).

4. **Tests:** New file `src/__tests__/lib/effective-fields.test.ts`, 15 cases all green. Full suite 103/106 (3 pre-existing gemini failures unaffected).

**Verified in production after merge:** New inputs render correctly. Item with worker price 750 + negotiable Yes displays as expected; condition grade pills correctly absent on New items.

---

## ARCHITECTURAL DECISION — IMPORTANT FOR FUTURE OVERRIDES

There's now a **fork in how admin overrides propagate to the public site:**

- **Most admin override fields** (brand, item_name, category, descriptions, FAQs, etc.) use the **`published_*` snapshot pattern** — at approval time, `admin_pending_publish.ts` computes `admin_X ?? ai_X` and writes a `published_X` column. Public site reads `published_X`.

- **Price + negotiable + condition_grade** use the **render-time fallback chain pattern** — `published_price_aed`, `published_negotiable`, `published_condition_grade` columns **do NOT exist**. Public site reads `admin_X ?? worker_X ?? sale_price` at every render.

**Why the fork:** SQL-confirmed those three `published_*` columns don't exist. PR scope explicitly said "if they don't exist, don't add them, use fallback chain." Acceptable because price/negotiable/condition are captured at worker submit (not AI-generated), so the worker layer is the canonical source. The `published_*` snapshot was designed for AI-generated text/SEO fields where snapshot-at-approval matters.

**Implication for next session:** If you build `admin_condition_type`, `admin_shop_id`, or `admin_condition_notes` overrides, decide consciously which pattern to use. Don't accidentally mix them.

---

## WHAT'S NOW DECIDED — DON'T RE-DEBATE

1. **PR 1 only, wait two weeks.** Hamzah deliberately chose to ship just price/negotiable/condition_grade and observe usage before building condition_type / shop_id / notes overrides. Reasoning: of 16 admin approvals before PR 57, admins overrode only 2 of 18 available fields. Building more override infrastructure ahead of demonstrated need is exactly the pattern that gave us dormant `admin_price_aed` in the first place.

2. **Quick-approve threshold stays at confidence ≥ 0.8 + zero flags.** Considered raising to 0.9 or killing entirely. Deferred — too early to tell if low override usage is "AI is great" vs "Hamzah rubber-stamps."

3. **`sale_price` column NOT retired.** Stays as final fallback in the chain. Worker upload still writes both `worker_price_aed` and `sale_price` on insert. Retiring it would touch every legacy row — too much blast radius for too little benefit.

4. **Phase 8 redefined.** The implementation spec's original "Phase 8 = daily summary endpoint" is now superseded. What shipped today (PR 57) IS Phase 8. Daily summary deferred indefinitely — low value until the WhatsApp bot exists. If renumbering matters, original Phase 9 (Cleanup) becomes Phase 10.

---

## OPEN OBSERVATIONS FROM TONIGHT

1. **Admins use overrides very rarely** — only `admin_spec_table` (7 rows) and `admin_trust_signals` (5 rows) of 16 Phase 5+ approvals had any non-null values across all 18 admin fields. AI output is being approved nearly verbatim. Two readings:
   - Optimistic: AI is good enough, override layer is insurance
   - Pessimistic: Quick-approve makes it easy to rubber-stamp; missing inputs (price, negotiable, photos) made real overrides impossible
   
   Two-week watch starting now will clarify which read is right.

2. **`FieldShell` reset link** previously rendered booleans as raw JSON ("Worker submitted: true — Reset"). Fixed in PR 57 to render Yes/No / bare numbers. Pre-existing minor bug, would have shipped broken UI otherwise.

3. **ESLint cannot run in Claude Code worktrees** because of a stray `.eslintrc.json` two levels above `.claude/worktrees/`. Pre-existing environmental issue. Vercel preview catches real lint problems.

---

## PRIORITY ORDER POST-PHASE-8-PR1

In order. Honest payoff assessment.

### 1. Two-week observation (passive)
**Effort:** zero. **Payoff:** the answer to whether PR 2 (condition_type, shop_id, notes overrides) is actually needed.
Watch how often Hamzah uses the new price/negotiable/condition_grade inputs in real approvals. Watch for verbal "I wish I could change X" frustrations. If zero override activity in 14 days → probably skip PR 2 entirely. If steady usage → consider PR 2.

### 2. Watch SEO results from Phase 7 (passive)
**Effort:** zero. **Payoff:** validation of Phase 7's actual SEO work.
Search Console over the next 30 days. Merchant listing impressions, local pack changes, breadcrumb appearance.

### 3. WhatsApp emoji bug (GitHub issue #48)
**Effort:** 1-2 hours. **Payoff:** customer-visible polish.
Every customer who clicks Negotiate sees broken `�` characters in the WhatsApp draft. Pre-existing. Worth fixing when low-energy.

### 4. PR 2 candidate (DEFERRED, do NOT plan yet)
If two-week observation surfaces real need:
- `admin_condition_type` (Used↔New flip)
- `admin_shop_id` (shop reassignment — has cascading effects: slug, geographic_anchor, WhatsApp pre-fill)
- `admin_condition_notes`
All would need schema migrations. All have non-trivial blast radius. Don't pre-plan until demand is real.

### 5. Backfill 46 legacy non-Appliance Product schemas
Same as Phase 7 handoff said — Hamzah said legacy products are "fine." Optional.

### 6. Daily summary endpoint (original Phase 8)
Build only after WhatsApp bot is live so summary can push to chat. Otherwise it's a bookmark nobody opens.

### 7. WhatsApp bot architecture (big lift)
Four-week build per existing notes. Designed but not yet built.

---

## RECOMMENDED FIRST PROMPT FOR NEXT SESSION

> "Phase 8 PR 1 (admin price + negotiable + condition_grade overrides) shipped May 14, 2026. Read docs/phase-7-handoff.md AND docs/phase-8-pr1-handoff.md before doing anything. The agreed plan is two-week observation before building more override fields. Then we'll pick the next move."

---

## END OF HANDOFF
