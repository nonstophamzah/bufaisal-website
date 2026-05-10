# Listing Generator Rebuild — Phase State

**Last updated:** 2026-05-10 (after detail-page + visibility-refresh hardening; full Phase 5 + image fix + legacy Pending tab removal closed)
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
**Status:** ✅ Complete (sidecar build alongside legacy `/admin`)

**Commit:** `7f14be2` on main (PR #26).

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

## Phases 6–9 — Not yet started

- **Phase 6:** Public site rendering switch to `published_*` columns + JSON-LD schemas. Will retire the "Phase 6 bridge" legacy-mirror block in `src/lib/admin-pending-publish.ts:97-117` and the `worker_photo_brand_url` fallback in `src/lib/item-image.ts` (or keep the latter — cheap insurance).
- **Phase 7:** Optional migration of legacy items (the 49 NULL-status rows still on the public site).
- **Phase 8:** Daily summary endpoint + monitoring.
- **Phase 9:** Cleanup — delete legacy `/api/jobs/generate-listing`, drop `JOBS_SECRET`, drop `agent_drafting` from the TS union, retire the legacy `/admin` Pending tab + its BETA link in the new nav, drop `supabase-backfill-image-columns.sql` (kept for reference, not used).

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

---

## Outstanding tech-debt items (for Phase 9 or earlier as needed)

1. **Pre-existing 3 failing tests in `src/__tests__/api/gemini.test.ts`** — predate Phase 3, unrelated to the listing pipeline. Likely a mocking issue with `@anthropic-ai/sdk`. Touch in passing if Phase 5 modifies the same mock pattern.
2. **`/api/jobs/generate-listing` legacy route** — zero callers in current code. Safe to delete in Phase 9.
3. **`JOBS_SECRET` env var** — only consumed by the legacy job route. Safe to drop in Phase 9.
4. **`agent_drafting` status value** — still in the TS union for any in-flight legacy rows. 0 rows match in production. Drop in Phase 9.
5. **CLAUDE.md known-issues #1, #2, #7, #10** about marketplace using anon Supabase from `/admin` — unchanged through Phases 1–4. Phase 5 will address as it rewrites the admin pending dashboard.

---

## Change log for this file

- **2026-05-10 (later):** Three follow-up items shipped (PR #29):
  - Detail GET endpoint now returns 409 for non-pending rows so deep links to `/admin/pending/<archived-id>` show a clear "this item is in 'X', not 'pending'" message instead of an editor with silently-failing buttons.
  - List view auto-refreshes on `document.visibilitychange` so a switched-and-returned tab doesn't show stale state.
  - Cleanup SQL `supabase-cleanup-archived-sold-inconsistency.sql` written for one row that ended up archived AND `is_sold=true` from a legacy mark_sold sequence (audit-trail-narrowed: only touches rows with an `admin_rejected` audit entry).
  - **Investigation rule** added above: ground truth (code + DB + audit_log) over screenshot-based inference. Triggered by a wasted bug-chase tonight where three reported `/admin/pending` bugs turned out to be screenshot-inferred symptoms with no actual code defect.
- **2026-05-10:** Phase 5 marked complete (PR #26). Added sitewide image-optimizer hotfix record (PR #27 — Vercel Hobby 402 quota, switched to custom Cloudinary loader). Added Phase 5 follow-up: legacy /admin Pending tab removed after discovering two production rows had been approved through it without populating `published_*` columns. Backfill SQL written. Updated Phases 6/9 to reference the new "Phase 6 bridge" mirror in `admin-pending-publish.ts` and the BETA-link cleanup.
- **2026-05-09:** Phase 4 marked complete. Added admin-approve bug record (PR #24). Added Phase 5 carryforward notes including the 49 legacy items.
