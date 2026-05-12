# Listing Generator Rebuild — Phase State

**Last updated:** 2026-05-12 (Phase 6.4 PR A + PR B SHIPPED — `/item/[id]` fully cut over to `published_*` columns)
**Owner:** Hamzah Khan
**Driver doc:** `docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md`
**Decisions log:** `docs/Bufaisal-Decisions-Log-v1_1-Addendum.docx`

This file is the canonical phase ledger for the 9-phase listing-generator rebuild. Update it at the close of every phase. Future Claude sessions read this first.

---

## Phase ledger

### Phase 0 — Audit & discovery
**Status:** ✅ Complete

Findings reported. State-machine mismatch flagged (legacy `agent_drafting`/`pending_review` vs spec's `processing`/`pending`). Established the rebuild scope.

### Phase 1 — Database schema migration
**Status:** ✅ Complete

**Commits:** `668e5b7` on main.
**Migration file:** `supabase-phase1-listing-generator.sql` in repo root.

What shipped:
- 67 nullable schema-separation columns on `shop_items` (`worker_*`, `ai_*`, `admin_*`, `published_*`).
- New `audit_log` table with RLS-enabled-no-policies (anon blocked, service_role bypasses).
- Status value migration: `pending_review` → `pending` (46 rows).
- Writer flipped from `'pending_review'` to `'pending'` at `src/app/api/jobs/generate-listing/route.ts`.

### Phase 2 — Photo upload optimization
**Status:** ✅ Complete

**Commits:** `7d5bfaf` (PR #19), `1e639d8` (PR #20).

What shipped:
- `browser-image-compression` library + self-hosted at `public/browser-image-compression.js`.
- CSP `worker-src 'self' blob:` so the Web Worker spawns on iPhone.
- Compression target: ~400KB max, 1600px long edge, JPEG.
- Phone-confirmed: 1–2s per photo on UAE 4G.

### Phase 3 — Worker upload screen rebuild
**Status:** ✅ Complete

**Commit:** `bd4cf90` on main (PR #22).

What shipped:
- `src/app/team/page.tsx` rebuilt around the locked pill design: 4 photos (3 item + 1 visually-distinct barcode), Used/New, Excellent/Good/Fair (when Used), Negotiable Yes/No, price, optional note.
- AI Scan removed from worker side. Phase 4 runs the AI in the background.
- Draft autosave to `localStorage` (`bufaisal-upload-draft`, 12h TTL, scoped to worker name) with Resume/Discard prompt.
- Submit UX: 1.5s smooth progress bar → green tick "Item uploaded ✓" → auto-redirect.
- `/api/team/items` tightened to the new `worker_*` shape with full validation. Status default flipped `'agent_drafting'` → `'processing'`.
- TS union extended: `ShopItem.status` now includes `'processing'`.

### Phase 4 — Background AI processor
**Status:** ✅ Complete and verified end-to-end in production

**Commits:**
- `12a1a54` (PR #23) — initial Phase 4 build
- `e7d4422` (PR #24) — admin-approve status fix (see "Bug found" below)

**What shipped:**

*Endpoints:*
- `POST /api/items/[id]/generate-listing` — Bearer-auth'd via `INTERNAL_API_SECRET`. Loads the locked SEO Agent v1.0 prompt from `lib/prompts/listing-generator-v1.md`, calls `claude-sonnet-4-6` with 4 Cloudinary photo URLs (URL image source format, no base64), validates JSON shape with up to 3 attempts, maps output to all 24 `ai_*` columns, flips `status='processing'` → `'pending'`. Every failure mode produces a `'pending'` row with a flag (`ai_api_timeout`, `ai_json_invalid`, `ai_validation_failed`, `photo_missing`, `ai_auth_error`).
- `GET /api/cron/cleanup-stuck-processing` — daily cron at 4am UTC (Hobby tier cap on sub-daily). Accepts Bearer matching `CRON_SECRET` or `INTERNAL_API_SECRET`.
- `src/lib/cleanup-stuck.ts` — `rescueStuckItems()` shared between the cron route and the piggyback `waitUntil()` on every worker submit. The piggyback gives us the 10-min stuck SLA in practice during business hours despite the daily cron cap.

*Wiring:*
- `/api/team/items` fires `waitUntil()` to `/api/items/[id]/generate-listing` after insert. Sub-2s submit latency preserved.
- `next.config.mjs` `outputFileTracingIncludes` ensures the prompt `.md` ships with the serverless function bundle.

*Tooling:*
- `src/scripts/process-backlog.ts` — one-time runner used to drain the Phase 3 phone-test backlog. Re-runnable; supports `--force` for reprocessing `'pending'` rows. Kept as documentation / future debugging tool.

*Constants:*
- `src/lib/ai.ts` exports both `CLAUDE_MODEL` (Haiku, for legacy `/api/gemini`) and `CLAUDE_SONNET_MODEL` (Sonnet 4.6, for Phase 4).

**Bug found and fixed** (PR #24):

The legacy admin-approve flow at `src/app/api/admin/items/route.ts:63` (and `:80`) and `src/app/api/admin/items/batch/route.ts:68` was setting `status: null` on approve — predating the Phase 1 state machine. On a fresh Phase 4 run, status would correctly land at `'pending'`, but the moment an admin clicked Approve, status got clobbered to NULL while `is_published=true`, `approved_by`, `approved_at` were correctly set. Fix: change all three writes to `status: 'published'`. TS union extended again to include `'published'`.

**Audit_log gap noted, not fixed:** legacy admin-approve does NOT write to `audit_log`. Phase 5's new admin approve must.

**Verification record:**
- Production row `01ff3138-63a7-4267-b782-0a41c0330022`
- `worker_submitted_at` → AI completion: 35 seconds
- `ai_seo_title` = "Used Apple MacBook Pro Laptop Space Gray"
- After admin approve: `status='published'`, `is_published=true`, `approved_by='Humaan'`, `approved_at` set
- Confirms the full pipeline `processing → pending → published` works end-to-end.

---

### Phase 5 — Admin pending dashboard
**Status:** ✅ Complete AND verified end-to-end in production

**Commits:** `7f14be2` on main (PR #26 — initial build). Six follow-up PRs hardened the flow: #27 (image render fix), #28 (legacy Pending tab removed), #29 (detail status guard + visibility refresh + cleanup SQL), #30/#31/#32 (diagnostic infrastructure, all reverted), #33 (Cache-Control no-store middleware — incomplete), #34 (six-layer cache-defeat fix that actually worked).

**Verification record (2026-05-10):** Hitachi Top-Mount Refrigerator (`4cea5546-1da6-48cb-b6c2-bf7a61232278`) approved through `/admin/pending` at 18:12:33 UTC. SQL confirmed all `published_*` columns populated correctly: `published_seo_title`, `published_description` (296 chars), `published_spec_table`, `published_faqs`, `published_trust_signals`, `published_brand`, `published_category`, `admin_approved_at`, `admin_approved_by="Admin"`. Audit_log entry written with `action='admin_approved'`, `via='detail_editor'` or `'quick_approve'`. Pipeline `processing → pending → published` works end-to-end through the new sidecar.

**What shipped:**

*New page routes (sidecar — legacy `/admin` untouched except for one BETA link in the nav):*
- `/admin/pending` — mobile-first card grid of every `status='pending'` row (strict equality — the 49 legacy NULL-status rows stay invisible). Filters: All / Needs Review (any flag OR confidence < 0.8) / Quick Approve eligible / by shop (BF1–BF5) / by category. Per-card: thumbnail, AI seo title, confidence dot (green ≥0.8 / yellow 0.6–0.8 / red <0.6), flag chips, Quick Approve button (gated client-side) + Review link.
- `/admin/pending/[id]` — full-page detail editor. Photo lightbox (4 photos, brand/photo_2/photo_3/barcode with extracted barcode shown underneath). 17 editable fields with the AI value as default; admin edits go to `admin_*` columns. Each field with an active override shows an "AI suggested: X — Reset" pill so admin can revert. Spec table key/value editor, FAQs editor (4 expandable rows), trust signals multi-select from the locked whitelist (off-whitelist signals AI emitted are still selectable, marked). Sticky bottom action bar: Approve & Publish (yellow), Save Edits, Regenerate AI (with confirm), Reject (red, with confirm).

*New API routes — all sidecar under `/api/admin/pending/`, none collide with legacy `/api/admin/items`:*
- `GET /` — list pending items (strict `status='pending'`, sorted by `worker_submitted_at` DESC).
- `GET /[id]` — single item + last 20 `audit_log` entries.
- `PATCH /[id]` — save admin_* edits without flipping status. Validates per-field; 409 if the row is no longer in `pending`.
- `POST /[id]/approve` — full publish flow. Computes `published_*` (admin override ?? AI), writes `published_at` + `admin_approved_*`, status → `published`, `is_published=true`. Mirrors into legacy columns (`item_name, brand, category, condition, sale_price, description, seo_title, seo_description, negotiable, product_type, barcode`) so bufaisal.ae renders correctly until Phase 6 retires the mirror. Audit log row with `via=detail_editor` and `overrides_applied` list.
- `POST /[id]/quick-approve` — same publish flow, but server re-checks the strict gate (confidence ≥ 0.8 AND empty/null `ai_flags` AND no admin override set). Returns 422 with reason if any check fails — client UI gating is purely UX. Audit log row with `via=quick_approve`.
- `POST /[id]/reject` — sets `status='archived'`, `is_published=false`. Cloudinary photos NEVER deleted. Audit log row.
- `POST /[id]/regenerate` — flips `status='pending'` → `'processing'`, then `waitUntil()` calls the existing Phase 4 endpoint with `force=true`. `admin_*` overrides preserved. Audit log row.

*Shared helpers:*
- `src/lib/admin-pending-api.ts` — typed client wrappers (Bearer from sessionStorage, 401 → bounce to `/admin`).
- `src/lib/admin-pending-publish.ts` — `buildPublishUpdate()` (computes `published_*` + legacy mirror — explicitly marked **"Phase 6 bridge — remove when public site reads published_* directly"**) and `writeAdminAudit()`.
- `src/app/admin/pending/lib/eligibility.ts` — `hasAnyAdminOverride()` + `isQuickApproveEligible()`. Single source of truth shared between client UI and the server quick-approve gate (re-exported from the publish helper).
- `src/app/admin/pending/types.ts` — `PendingItem` interface with all worker_*/ai_*/admin_* columns. Did NOT mutate the legacy `ShopItem` interface in `src/lib/supabase.ts` (consumed by /item, /shop, legacy /admin).

*Legacy /admin nav:* one new "→ New Pending" link with a BETA badge. The only edit on the legacy admin code. Removable in Phase 9.

**Auth:** reuses `useAdminAuth` + `verifyAdmin` (HMAC bearer token from sessionStorage). `AdminLogin` component rendered inline if not authed.

**Skipped published_* columns:** the Phase 1B migration did not create `published_h1_title`, `published_geographic_anchor`, `published_image_alt_texts`, `published_product_schema`, or `published_faq_schema`. Phase 5 ignores these — Phase 6 owns whether they become real columns or stay as `ai_*` reads.

---

### Sitewide image-optimizer hotfix (PR #27)
**Status:** ✅ Complete and verified live in production

**Commit:** `d88da5a` on main.

**What broke:** Hours after Phase 5 shipped, every Cloudinary thumbnail across the site rendered as a broken-image icon. Reproduced live: `curl -sI https://bufaisal.ae/_next/image?url=<cloudinary>...` returned `HTTP 402` with `x-vercel-error: OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` — the project hit Vercel Hobby's monthly image-optimization quota. Data layer was healthy (URLs valid, columns populated); failure was purely at the Vercel optimizer paywall.

**What shipped:**
- `src/lib/cloudinary-loader.ts` — custom next/image loader. For `res.cloudinary.com` URLs injects Cloudinary's own transforms (`f_auto,q_<n>,w_<n>,c_limit`) into the URL path; everything else passes through unchanged. Cloudinary serves the optimized images from its CDN, free at our volume.
- `next.config.mjs` — `images.loader = 'custom'`, `loaderFile = './src/lib/cloudinary-loader.ts'`. When custom loader is set, next/image stops calling `/_next/image` entirely, so the Vercel quota is no longer in the path. `formats` and `remotePatterns` kept for `next dev` validation.
- `src/lib/item-image.ts` — centralized fallback chain: `thumbnail_url > image_urls[0] > worker_photo_brand_url > /og-image.png`. `getItemImageUrl()` (with placeholder, for `<img>`) and `resolveItemImageUrl()` (without, for JSON-LD).
- `src/components/ItemCard.tsx`, `src/app/shop/shop-client.tsx`, `src/app/item/[id]/page.tsx` — all import from the helper. No more chain repetition. `src/app/item/[id]/item-detail-client.tsx` gets the `worker_photo_brand_url` fallback inline (multi-image gallery doesn't fit the single-URL helper).
- `src/lib/supabase.ts` — `worker_photo_brand_url`, `worker_photo_2_url`, `worker_photo_3_url`, `worker_photo_barcode_url` added to `ShopItem` so the helper compiles.
- `supabase-backfill-image-columns.sql` — defensive backfill script that copies `worker_photo_brand_url` into empty `thumbnail_url` / `image_urls`. **Written but not needed:** zero rows affected. Kept in repo as documentation of the intended cleanup; safe to delete in a future cleanup PR.

**Verification:** `<img src>` on production /shop now points directly at `https://res.cloudinary.com/df8y0k626/image/upload/f_auto,q_75,w_<width>,c_limit/...`. The legacy `/_next/image` URL pattern returns 404 (proving we're cleanly off the optimizer, not just papered over). Direct Cloudinary fetches return 200 + `image/jpeg`.

---

### Phase 5 follow-up — legacy Pending tab removed
**Status:** ✅ Complete

**Bug found** (2026-05-10): two production rows had `status='published'` + `is_published=true` but ALL 12 `published_*` columns were NULL. Service-role row dump showed `admin_approved_at = NULL` and zero `admin_*` entries in `audit_log` for the rows — they had been approved through the LEGACY `/admin` Pending tab, not the new `/admin/pending` dashboard. The legacy approve flow at `/api/admin/items` (action='approve' / 'bulk_approve' / batch) only sets `is_published=true` + `approved_by`/`approved_at`; it never computed `published_*` or wrote `audit_log`. The public site fell back to legacy text columns and looked correct, masking the bug until we queried the data directly.

**Fix shipped:**
- `src/app/admin/page.tsx` — removed the `'pending'` entry from the `tabs` nav array, changed default state from `useState<Tab>('pending')` to `useState<Tab>('published')` so first load lands on Live, and dropped the `tab === 'pending'` branch from the render switch (defense in depth — even if state somehow becomes 'pending', it renders nothing). The `'pending'` value is kept in the `Tab` union and in `/api/admin/items` for backwards compat with any direct API callers (none in current code) until Phase 9.
- `supabase-backfill-published-columns.sql` — backfill script for the 2 broken rows. Computes `published_X = COALESCE(admin_X, ai_X)` per spec §5C, populates the legacy mirror columns (only where they are empty/NULL — never overwrites a manually-edited value), backfills `admin_approved_*` from the legacy `approved_*` so the row has a Phase-5-shaped record. Idempotent. Run by Hamzah in Supabase SQL Editor after the code merges.

**Verification before shipping** (the three leakage checks):
1. `/admin?tab=pending` direct URL — confirmed not routable (no useSearchParams, no router → state sync). The default-tab change covers first-load; the render-switch removal covers any code path that flips state to 'pending'.
2. Live / Sold / Hidden tab filters — they query by `is_published`/`is_sold`/`is_hidden` flags, not by `status`. Phase 4-generated pending rows have all three flags `false` so they only matched the (now-removed) Pending tab. No leakage.
3. Other admin entrypoints — single-item Approve renders only inside `AdminItems` when `tab === 'pending'`; bulk approve only appears in `BULK_ACTIONS_BY_TAB.pending`. No other UI surface invokes the legacy approve action. The login page and back-buttons land on the new default tab (Live).

**Known secondary paths NOT fixed:** `mark_live` (Hidden tab → "Move to Live") and `unmark_sold` (Sold tab → "Restore") both set `is_published=true` without computing `published_*`. They're legitimate workflows for already-published items returning to Live (customer cancels a sale, admin unhides). Not a way to publish a fresh pending row after Option B. Phase 9 closes these once the legacy admin route is fully retired.

**How to verify the bug is gone after future approvals:**
```sql
SELECT id, status, published_description, published_seo_title,
       admin_approved_at, admin_approved_by
FROM shop_items
WHERE id = '<approved_item_id>';
-- All four columns should be non-NULL after a /admin/pending approval.
```

---

## Phases 6–9

### Carryforward from 2026-05-10 (handle BEFORE Phase 6 starts)

1. **Revert v4 diagnostic in `src/app/api/admin/pending/route.ts`** — one follow-up PR. Drop the `debug_pending_list_call_v4` audit_log INSERT block (clearly marked "TEMP DIAGNOSTIC v4 — REMOVE IN FOLLOW-UP PR"). Keep the six cache-defeat layers — those are load-bearing, not diagnostic.
2. **Run the two pending backfill SQLs in Supabase SQL Editor** (Hamzah-only):
   - `supabase-backfill-published-columns.sql` — backfills the 2 MacBook rows that were legacy-approved before Option B closed that path.
   - `supabase-cleanup-archived-sold-inconsistency.sql` — clears `is_sold=true` on the TV stand row.
3. **Cleanup the diagnostic audit_log entries** when comfortable:
   ```sql
   DELETE FROM audit_log WHERE action LIKE 'debug_%';
   ```
4. **3 pending items still in the queue** (Yousuf's chest freezer + gas cooker, Hamzah's fridge) — can be approved through `/admin/pending` anytime. The flow is verified working.
5. **Low-priority observation, deferred:** AI emitted "Since 2009 — UAE's largest used goods market" as off-whitelist when it IS on the universal whitelist. Possible duplicate detection bug in the trust-signals editor's whitelist match, possible em-dash vs hyphen vs spacing normalization issue. Punt to Phase 6 or 9.

### Phase 6 — Public site rendering switch

Subdivided in execution into sequential sub-phases. Sub-phases 6.0 → 6.4 are complete; 6.5 is next.

#### Phase 6.0 — Visibility hygiene
**Status:** ✅ Complete (rolled into earlier PRs). Public `/item/[id]` filters on `is_published=true AND is_hidden=false`, blocking processing/pending/archived UUID leaks. `is_sold` intentionally NOT filtered so sold rows keep their SEO surface with the SOLD overlay.

#### Phase 6.1 — JSONB column additions
**Status:** ✅ Complete. Migration `021_add-phase6-published-columns.sql` added `published_h1_title`, `published_geographic_anchor`, `published_image_alt_texts`, `published_product_schema`, `published_faq_schema`, `published_slug`. Phase 1B Skipped published_* note in §Phase 5 is now resolved.

#### Phase 6.2 — Publish helper writes the new JSONB columns
**Status:** ✅ Complete (PR #38). `src/lib/admin-pending-publish.ts` `buildPublishUpdate()` now writes all 16 published_* columns including the JSONB schema fields.

#### Phase 6.3 — Public site reads text fields from `published_*`
**Status:** ✅ Complete (PR #40, commit `67cbd29` on main, verified live).

What shipped:
- `src/lib/resolve-public-item-fields.ts` resolver introduced. Pattern: `item.published_X ?? item.legacy_X` (`??`, never `||`).
- Consumers cut over: `src/app/item/[id]/page.tsx` (metadata + body), `src/app/item/[id]/item-detail-client.tsx`, `src/app/shop/shop-client.tsx`, `src/components/ItemCard.tsx`. Seven text fields covered.
- Column-name mismatch documented: `published_meta_description` ↔ `seo_description` (Decisions Log v1.1).

#### Phase 6.4 PR A — `/item/[id]` schema + data wiring
**Status:** ✅ Shipped 2026-05-12 (PR #44, merged at `495e0b7` on main).

What shipped:
- Resolver extended with five JSONB fields: `productSchema`, `faqSchema`, `specTable`, `faqs`, `trustSignals`.
- New `src/lib/augment-product-schema.ts` — render-time SEO augmentation of stored `published_product_schema` with page-level fields (sku, canonical URL, category, seller block with `legalName`, idempotent "Price is negotiable." description hint). Non-destructive — only fills gaps, never overwrites.
- `src/app/item/[id]/page.tsx` — ripped out the hand-built inline Product JSON-LD. Two new `<script type="application/ld+json">` blocks: augmented `published_product_schema` + verbatim `published_faq_schema`. New `escapeJsonLd()` helper rewrites `</script>` to `<\/script>` for script-tag breakout safety.
- `src/app/item/[id]/item-detail-client.tsx` — renders bullet trust signals, semantic `<table>` spec table with canonical key order, native `<details>` FAQ accordion with rotating chevron.
- `ShopItem` interface: added `worker_negotiable`, `admin_negotiable`, `published_product_schema`, `published_faq_schema`, `published_spec_table`, `published_faqs`, `published_trust_signals`. All additive.
- Breadcrumb position-3 + position-4 fixed to flow through resolver.
- Seller block includes `legalName: "Bu Faisal General Trading LLC"` per Decisions Log 2026-05-01 brand lock.
- Negotiable source: `item.admin_negotiable ?? item.worker_negotiable` (not legacy `item.negotiable` mirror — that retires in 6.5).

**Verification:** All 5 currently-published rows have full `published_*` JSONB populated. Zero SEO regression risk for current inventory.

#### Phase 6.4 PR B — `/item/[id]` layout & conversion polish
**Status:** ✅ Shipped 2026-05-12 (PR #45, merged at `3e24686` on main).

What shipped:
- New `src/lib/shops.ts` — canonical shop config for the public site. Maps BF1–BF5 to display names + Google Maps GBP URLs. `getShop(workerShopId)` lookup. Imported ONLY by `/item/[id]` (NOT by `/admin`).
- Spec-table Location row renders as clickable Google Maps GBP link with `ExternalLink` icon when shop has a `mapUrl`.
- New Photos section between spec table and FAQ — 4-thumbnail responsive grid (2-col mobile, 4-col desktop) sourcing `worker_photo_*` columns directly. Click to open `yet-another-react-lightbox` (~30 KB, first image-display library in the repo). Accessible: focus trap, Escape, keyboard arrow nav.
- New `src/lib/similar-items.ts` — three-tier query (brand+category → category+shop → category), freshness sort, dedupe across tiers, hide if <4 matches.
- New `SimilarItemCard` co-located in `item-detail-client.tsx` for purely navigational cards (no per-card WhatsApp button — prevents cognitive split with main page CTA, Amazon/Noon/IKEA pattern). Site-wide `ItemCard` unchanged for homepage / shop feeds.
- "WHATSAPP" → "NEGOTIATE" rename on desktop inline + mobile sticky buttons per Architecture doc 2.1. Floating green WhatsApp circle stays as generic site-wide contact CTA, NOT product-specific.
- `ShopItem` interface: added `worker_shop_id`, `published_image_alt_texts`. Additive.

**Verification:** Dev-mode visual check with threshold=2 on Hitachi page rendered Similar items with 2 cards (Chest Freezer + Siemens Gas Cooker), zero per-card WhatsApp/MessageCircle, each card a single `<a href="/item/UUID">`. Threshold restored to 4 before commit.

#### Phase 6.5 — Retire the legacy mirror (NEXT)
**Status:** ⏳ Design pending.

What to do:
- Delete the "Phase 6 bridge — remove when public site reads published_* directly" block in `src/lib/admin-pending-publish.ts` lines ~116–136. The mirror writes `item_name, brand, category, condition, sale_price, description, seo_title, seo_description, negotiable, product_type, barcode` alongside `published_*` at approve time. Public site no longer reads these; mirror is dead-code at the write path.
- Retire `resolvePublicItemFields()` once the legacy columns are physically dropped (separate cleanup PR, destructive — needs explicit migration with rollback plan).
- Keep the legacy columns in the table for now — mirror just stops receiving NEW writes. Column drops are deferred to a later cleanup PR.

Considered alternatives recorded in Decisions Log 2026-05-12: keep mirror as safety net (rejected — two writers = drift risk we're eliminating), drop columns immediately (deferred — destructive, separate PR).

#### Worker_photo_brand_url fallback in `src/lib/item-image.ts`
Cheap insurance, keep through Phase 6.5. Re-evaluate during Phase 9 cleanup.

### Phases 7–9
- **Phase 7:** Optional migration of legacy items (the 49 NULL-status rows still on the public site).
- **Phase 8:** Daily summary endpoint + monitoring.
- **Phase 9:** Cleanup — delete legacy `/api/jobs/generate-listing`, drop `JOBS_SECRET`, drop `agent_drafting` from the TS union, retire the legacy `/admin` Pending tab + its BETA link in the new nav, drop the diagnostic-reference SQL files (`supabase-backfill-image-columns.sql`, the v4 cleanup).

---

## Workflow rules (carry forward to every phase)

Per memory `feedback_listing_generator_workflow.md`:

- **Approval is per step, not per phase.** Wait for "approved" / "proceed" before each step.
- **Default: PR + merge** (not direct fast-forward) for meaty phases. Hamzah did fast-forward for Phase 1, then PR + merge for Phases 3 and 4. Phase 5 should follow the PR pattern.
- **Hamzah runs SQL migrations himself** in the Supabase SQL Editor. Claude produces the SQL file, commits, pushes, then waits for Hamzah's verification queries.
- **Companion docs win conflicts** with the implementation spec. If `Bufaisal-Decisions-Log-*.docx`, `Bufaisal-SEO-Agent-v1.0.docx`, or `Bufaisal-Listing-Generator-Prompt-*.md` disagree with the spec — stop and flag.
- **Sacred routes:** `/team`, `/admin`, `/appliance-tracker`, `/api/appliances`. Surgical edits only; never refactor end-to-end without explicit ask.
- **Scope discipline:** "two-line change" means two lines. Comment cleanup is Phase 9 material.

### Investigation rule: ground truth over screenshots
**Added 2026-05-10 after a wasted bug-chase that Phase 5 didn't actually have.**

When a bug is reported with screenshot- or memory-based symptoms:

1. **Read the actual route file first.** Find the SQL/update payload that supposedly does the wrong thing. Confirm what it actually writes vs what's reported.
2. **Read the actual DB row via service role.** What columns are populated, what's NULL, what the audit_log says about who did what when. The script `/tmp/dump-bug-rows.mjs` (Hamzah-side) reads creds from `.env.local` + `.env.production.local` — copy and adapt.
3. **Check the audit_log timeline.** Reconstruct what happened from `before_state`/`after_state` diffs. If a transition exists in the data but not in the audit trail, suspect legacy actions (legacy `/api/admin/items` doesn't write audit_log).
4. **Only then write code.** If steps 1-3 contradict the report, push back with the evidence rather than building a fix for a non-existent bug.

The 2026-05-10 case: three bugs reported in `/admin/pending` (list shows wrong rows, reject sets `is_sold=true`, reject doesn't write audit_log). All three were screenshot-inferred. The actual code was correct on all three counts. The real cause was a separate legacy-`/admin` `mark_sold` action with no audit trail (legacy admin doesn't write audit_log) plus stale browser state in the list view.

What to keep doing: Hamzah's "Investigate before fixing. Verify all three bugs in the actual route files before writing fixes. Report findings first." framing is the right one. Don't skip steps under time pressure.

**Corollary added later same day**: when the screenshot symptom turns out to be REAL (the 12-hour-later report from a fresh device showing the same archived row), the investigation rule still applies — but the answer may be deeper than the route handler. In that case it was Vercel CDN serving a stale response without invoking the function. Diagnosis required deploying temporary diagnostic logging that wrote into `audit_log` (because we couldn't read Vercel runtime logs and couldn't mint a session token from this side). Three iterations of diagnostic — v1 captured the response, v2 returned zero entries (the function never fired), v3 added a heartbeat at the very top of the function plus explicit `Cache-Control: no-store` and the entries reappeared while the bug went away. Lesson: when reported symptoms reproduce on a fresh device after long elapsed time, suspect caching at every layer (CDN, browser, edge) — not just route logic.

### Cache-Control rule: dynamic ≠ uncached (and `force-dynamic` does NOT imply `fetchCache`)
**Added 2026-05-10 after the CDN cache-poisoning incident, REVISED same day after PR #33 turned out to be incomplete.**

There are TWO independent caches that can serve stale data on a Next.js App Router API route:

**Cache layer 1 — CDN/browser** (response header). Next.js's default response header for dynamic routes is `Cache-Control: public, max-age=0, must-revalidate`. Vercel's CDN edge and iOS Safari Mobile interpret this permissively and DO cache. Fix: explicit `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` on the response. Set globally in `src/middleware.ts` for every `/api/*` except `/api/feed`. (PR #33 fixed this layer.)

**Cache layer 2 — Next.js Data Cache** (the supabase-js `fetch()` calls inside the handler). This one is the trap. Next.js docs claim `dynamic = 'force-dynamic'` implies uncached data fetching, but **in practice on Vercel that implication does NOT hold for fetches issued by third-party libraries (supabase-js)**. The route handler may receive cached PostgREST responses internally even though the OUTER response correctly has `Cache-Control: no-store`. Symptom is identical to a CDN cache: stale data served to fresh sessions across multiple devices/browsers. (PR #34 fixed this layer.)

**The full belt-and-braces stack** required for an auth-gated dynamic API route that uses supabase-js (see `src/app/api/admin/pending/route.ts` for the canonical example):

```ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { unstable_noStore as noStore } from 'next/cache';

export async function GET(request) {
  noStore();  // runtime opt-out

  // Build a fresh supabase client per-request (defeats singleton cache)
  const client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      // Belt-and-braces: pass cache:'no-store' to every fetch supabase makes
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store' as RequestCache }),
    },
  });

  const { data } = await client.from(...).select(...).eq(...);

  return NextResponse.json(
    { items: data },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}
```

Six layers, all needed. Removing any one will cost hours of debugging.

Three things to remember:
1. **`dynamic = 'force-dynamic'` is necessary but not sufficient — for EITHER cache layer.** Trust the docs at your peril; verify empirically with the audit_log diagnostic technique (#9 in carryforward).
2. **Route-handler response headers win over middleware-set headers** when the same key is set in both, so middleware gives the default and route handlers can override (this is how `/api/feed` keeps its 1-hour cache despite the middleware rule).
3. **POST endpoints are technically less likely to be CDN-cached** per HTTP semantics, but defensive `no-store` is cheap and prevents future Vercel-edge-case surprises. The middleware applies it to every method by default.

**The 6-hour debugging cost on 2026-05-10**: PR #33 was shipped and verified at the WIRE level (curl confirmed `Cache-Control: no-store` on responses). I extrapolated "wire-level fix is correct" → "bug is fixed". Wrong. The Next.js Data Cache (layer 2) was still serving stale data INSIDE the handler. Hamzah caught this when an incognito session on a different browser engine still showed stale data — different sessions ruling out client-side cache. Lesson: when claiming a cache fix works, verify the actual auth'd response BODY (via diagnostic audit_log INSERT or a session-token-equipped curl), not just response headers.

---

## Outstanding tech-debt items (for Phase 9 or earlier as needed)

1. **Pre-existing 3 failing tests in `src/__tests__/api/gemini.test.ts`** — predate Phase 3, unrelated to the listing pipeline. Likely a mocking issue with `@anthropic-ai/sdk`. Touch in passing if Phase 5 modifies the same mock pattern.
2. **`/api/jobs/generate-listing` legacy route** — zero callers in current code. Safe to delete in Phase 9.
3. **`JOBS_SECRET` env var** — only consumed by the legacy job route. Safe to drop in Phase 9.
4. **`agent_drafting` status value** — still in the TS union for any in-flight legacy rows. 0 rows match in production. Drop in Phase 9.
5. **CLAUDE.md known-issues #1, #2, #7, #10** about marketplace using anon Supabase from `/admin` — unchanged through Phases 1–4. Phase 5 will address as it rewrites the admin pending dashboard.

---

## Change log for this file

- **2026-05-12 (latest):** Phase 6.4 PR A (#44 at `495e0b7`) and PR B (#45 at `3e24686`) both shipped to main. Public `/item/[id]` fully cut over to `published_*` columns for text + JSONB. Sub-phase ledger added (6.0 → 6.5) with explicit status per sub-phase. `src/lib/augment-product-schema.ts`, `src/lib/similar-items.ts`, `src/lib/shops.ts` documented. `yet-another-react-lightbox@^3` is the repo's first image-display library. Phase 6.5 (retire legacy mirror in `admin-pending-publish.ts`) is the next step — design pending.
- **2026-05-11:** Phase 6.3 shipped (PR #40 at `67cbd29`). Resolver `src/lib/resolve-public-item-fields.ts` introduced. Public site reads text fields from `published_*` with `??` fallback to legacy.
- **2026-05-10 (latest):** Phase 5 VERIFIED end-to-end (PR #34). After PR #33's middleware fix turned out to be incomplete — symptom recurred for incognito sessions on a different browser engine, ruling out client cache — discovered Next.js Data Cache (layer 2) was still serving stale supabase-js responses inside the handler despite `dynamic='force-dynamic'`. PR #34 added five more cache-defeat layers: `revalidate=0`, `fetchCache='force-no-store'`, `unstable_noStore()`, fresh supabase client per-request, custom fetch wrapper with `cache:'no-store'`. Diagnostic confirmed the fix; refrigerator approval test passed. **Cache-Control rule above REVISED** to document both cache layers.
- **2026-05-10 (later still):** Cache-Control fix shipped (PR #33) after a real production cache-poisoning incident on `/api/admin/pending`. Diagnosis required three iterations of temp diagnostic logging into `audit_log` because we couldn't read Vercel runtime logs from this side. Root cause believed at the time: Vercel CDN serving stale responses without invoking the function. Fix: middleware-level `Cache-Control: no-store` on every `/api/*` except `/api/feed`. Reverted PRs #30/#31/#32 (the temp diagnostics). Added the **Cache-Control rule** above. **Note: this turned out to be only ~half the fix; see PR #34 entry above for the full story.**
- **2026-05-10 (later):** Three follow-up items shipped (PR #29):
  - Detail GET endpoint now returns 409 for non-pending rows so deep links to `/admin/pending/<archived-id>` show a clear "this item is in 'X', not 'pending'" message instead of an editor with silently-failing buttons.
  - List view auto-refreshes on `document.visibilitychange` so a switched-and-returned tab doesn't show stale state.
  - Cleanup SQL `supabase-cleanup-archived-sold-inconsistency.sql` written for one row that ended up archived AND `is_sold=true` from a legacy mark_sold sequence (audit-trail-narrowed: only touches rows with an `admin_rejected` audit entry).
  - **Investigation rule** added above: ground truth (code + DB + audit_log) over screenshot-based inference. Triggered by a wasted bug-chase tonight where three reported `/admin/pending` bugs turned out to be screenshot-inferred symptoms with no actual code defect.
- **2026-05-10:** Phase 5 marked complete (PR #26). Added sitewide image-optimizer hotfix record (PR #27 — Vercel Hobby 402 quota, switched to custom Cloudinary loader). Added Phase 5 follow-up: legacy /admin Pending tab removed after discovering two production rows had been approved through it without populating `published_*` columns. Backfill SQL written. Updated Phases 6/9 to reference the new "Phase 6 bridge" mirror in `admin-pending-publish.ts` and the BETA-link cleanup.
- **2026-05-09:** Phase 4 marked complete. Added admin-approve bug record (PR #24). Added Phase 5 carryforward notes including the 49 legacy items.
