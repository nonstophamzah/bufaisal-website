# Bu Faisal — Project Context for Claude

## What This Project Is

Bu Faisal is a Next.js 14.2 platform for a UAE-based second-hand goods business operating 5 shops (A–E) in Ajman. It has two major systems:

1. **Marketplace (bufaisal.ae)** — Customer-facing ecommerce where people browse items and WhatsApp to buy
2. **Appliance Tracker (/appliances)** — Internal operations system tracking appliance intake, repair, movement, and delivery across shops and the Jurf repair warehouse

The long-term goal: make the appliance tracking system so precise that an AI agent can run the operational workflow autonomously — employees upload 1–2 photos with minimal context, and the system handles identification, categorization, routing, status updates, and notifications.

## Tech Stack

- **Framework:** Next.js 14.2 (App Router), React 18, TypeScript
- **Styling:** TailwindCSS 3.4, custom `font-heading` class for headings
- **Database:** Supabase (PostgreSQL with RLS policies)
- **Auth:** PIN-based admin login (bcrypt), shop passwords (bcrypt), entry/manager codes for appliance tracker
- **AI:** Anthropic Claude. Two models in production:
  - `claude-haiku-4-5-20251001` for the legacy `/api/gemini` actions (appliance tracker barcode scan, diesel route OCR). Migrated from Gemini in PR #11; route file still named for legacy reasons.
  - `claude-sonnet-4-6` for the Phase 4 listing-generator pipeline at `/api/items/[id]/generate-listing`. The locked SEO Agent v1.0 prompt at `lib/prompts/listing-generator-v1.md` is the system prompt.
- **Images:** Cloudinary (uploads), Supabase Storage, Unsplash (category cards). next/image is wired to a custom loader at `src/lib/cloudinary-loader.ts` that injects Cloudinary transforms (`f_auto,q_<n>,w_<n>,c_limit`) and bypasses Vercel's `/_next/image` optimizer entirely (which 402'd at the Hobby quota on 2026-05-09 and broke every Cloudinary thumbnail site-wide — see PR #27).
- **Hosting:** Vercel
- **Analytics:** Facebook Pixel

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Marketplace homepage (category pills, product grid)
│   ├── item/[id]/          # Product detail pages (SSR metadata)
│   ├── team/               # Worker upload portal. Phase 3 rebuilt this around the locked pill design: 4 photos (3 item + 1 visually-distinct barcode) → Used/New → Excellent/Good/Fair (when Used) → Negotiable Yes/No → price → optional note. NO AI button. Submit lands the row in status='processing' and Phase 4 runs the AI in the background.
│   ├── admin/              # Legacy admin dashboard (settings, analytics, Live/Sold/Hidden tabs). Phase 5 added a "→ New Pending [BETA]" link in the nav. The legacy Pending tab was REMOVED on 2026-05-10 after two production rows were approved through it and ended up status='published' with all 12 published_* columns NULL — the legacy approve flow at /api/admin/items never computed them. All approvals now go through /admin/pending. Default tab is 'published' (Live). The 'pending' value stays in the Tab union and the API for backwards compat with any direct callers (none in current code) until Phase 9.
│   ├── admin/pending/      # Phase 5: NEW admin pending dashboard. /admin/pending lists rows with status='pending' (strict). /admin/pending/[id] is the full-page detail editor with photo lightbox, 17 editable fields, audit_log history, sticky action bar (Approve/Save/Regenerate/Reject). Quick Approve gated by confidence ≥ 0.8 AND no flags AND no admin overrides — server re-checks the same rule.
│   ├── appliances/         # Appliance tracker (the core ops system)
│   │   ├── page.tsx        # Entry code gate
│   │   ├── select/         # Worker selection (SHOP/JURF/SECURITY tabs)
│   │   ├── shop/in/        # 3-screen intake: details → photo → confirm
│   │   ├── shop/out/       # Track outflows
│   │   ├── jurf/           # Jurf warehouse team workflow
│   │   ├── cleaning/       # Cleaning team
│   │   ├── security/       # Security logging
│   │   ├── delivery/       # Delivery tracking
│   │   ├── manager-gate/   # Manager code entry
│   │   └── manager/        # Manager dashboard (search, bulk actions, CSV export)
│   └── api/
│       ├── auth/           # Admin PIN validation (bcrypt, rate-limited)
│       ├── shop-auth/      # Shop password validation (bcrypt)
│       ├── appliances/     # All appliance CRUD (single POST endpoint, action-based)
│       ├── gemini/         # Claude Haiku image analysis (legacy name; serves appliance tracker + diesel)
│       ├── team/items/     # Worker submit endpoint (Phase 3). Inserts row with status='processing' and fires waitUntil() to /api/items/[id]/generate-listing.
│       ├── items/[id]/generate-listing/  # Phase 4: background AI processor. Bearer auth via INTERNAL_API_SECRET. Loads the locked SEO Agent v1.0 prompt, calls Sonnet, populates 24 ai_* columns, flips status='processing' → 'pending'.
│       ├── cron/cleanup-stuck-processing/ # Phase 4 safety net. Daily cron (Hobby tier cap) plus piggyback on every worker submit — flips any 'processing' row older than 10 min to 'pending' with ai_stuck_in_processing flag.
│       ├── jobs/generate-listing/ # LEGACY. Filters strictly on status='agent_drafting' (no rows match anymore). Has zero callers in current code. Retires in Phase 9.
│       ├── admin/items/    # Legacy admin actions endpoint (approve / reject / hide / mark-sold / etc., action-dispatched POST). Untouched by Phase 5.
│       ├── admin/pending/  # Phase 5: sidecar admin endpoints for the new dashboard. GET / (list), GET|PATCH /[id] (detail + save admin_* edits), POST /[id]/approve (full publish + legacy mirror), POST /[id]/quick-approve (server re-checks the strict gate, returns 422 if not eligible), POST /[id]/reject (status='archived'), POST /[id]/regenerate (waitUntil → /api/items/[id]/generate-listing with force=true). All write to audit_log with actor_type='admin'.
│       └── track-click/    # WhatsApp click tracking
├── scripts/
│   └── process-backlog.ts  # One-time runner: drains any status='processing' rows by curling the generate-listing endpoint. Safe to re-run; supports --force for 'pending' reprocessing.
├── components/             # Shared UI (Navbar, Hero, ItemCard, Footer, WhatsAppFloat)
└── lib/
    ├── supabase.ts         # Anon client + TypeScript interfaces (ShopItem.status union: processing | pending | published | agent_drafting | sent_back | null)
    ├── supabase-admin.ts   # Service role client (server-side only)
    ├── ai.ts               # CLAUDE_MODEL (Haiku constant) + CLAUDE_SONNET_MODEL constant. Plus the legacy buildItemListingPrompt + callAIVision used by /api/gemini.
    ├── cleanup-stuck.ts    # rescueStuckItems(): shared cleanup logic used by the cron route AND the piggyback waitUntil() on every worker submit.
    ├── admin-pending-api.ts        # Phase 5: typed client wrappers for the /api/admin/pending sidecar endpoints. Bearer from sessionStorage, 401 → bounce to /admin.
    ├── admin-pending-publish.ts    # Phase 5: server-only helpers — buildPublishUpdate() (computes published_* exclusively; the legacy mirror block retired in Phase 6.6 / PR #50) and writeAdminAudit().
    ├── resolve-public-item-fields.ts  # Phase 6.3 resolver: the seven text fields the public site reads off shop_items. Pattern `published_X ?? legacy_X` (?? not ||). Phase 6.4 PR A extended it with the five JSONB fields (productSchema, faqSchema, specTable, faqs, trustSignals). Still load-bearing for pre-Phase-5 legacy rows; retires only after the legacy text columns are physically dropped from shop_items (Phase 9 or later).
    ├── resolve-schema-images.ts    # Phase 6.4 prerequisite (PR #41): substituteSchemaImages() — substitutes placeholder `image[]` tokens in stored published_product_schema with real Cloudinary URLs at publish time. Called by admin-pending-publish.ts and the one-shot backfill script. Pure function, returns a clone.
    ├── augment-product-schema.ts   # Phase 6.4 PR A: augmentProductSchema() — render-time SEO augmentation of stored published_product_schema with page-level fields the AI cannot know (sku, canonical url, category, seller block with legalName, "Price is negotiable." description hint when applicable). Non-destructive — only fills gaps, never overwrites existing keys. Pure function. Called by src/app/item/[id]/page.tsx.
    ├── similar-items.ts    # Phase 6.4 PR B: fetchSimilarItems() — three-tier query for related products. Tier 1 = same brand + same category, Tier 2 = same category + same worker_shop_id, Tier 3 = same category overall. Within each tier orders by published_at DESC (freshness). Dedupes across tiers by id, slices to 8. Returns [] if total < 4 (MIN_THRESHOLD) so the section hides. Filters on published_brand/published_category for Phase 6.5 forward-compat. Anon Supabase client, RLS reads published items only.
    ├── shops.ts            # Phase 6.4 PR B: canonical shop config for the public site. SHOPS record maps BF1–BF5 to display names + Google Maps GBP URLs for all 5 Ajman shops. getShop(workerShopId) lookup. Imported by /item/[id], ItemCard, and buildWhatsAppUrl (canonical shop name for WhatsApp drafts) after Phase 6.5b.1; NOT by /admin (legacy shop_source/shop_label reads in admin still work). The thin SHOPS in constants.ts remains unchanged and should retire in a future cleanup PR.
    ├── local-business-schema.ts    # Phase 7 PR #53: LOCAL_BUSINESS_SCHEMAS — static array of 5 sibling LocalBusiness JSON-LD entities (one per shop) with per-shop geo + aggregateRating + sameAs GBP URLs, all cross-referenced to root Organization via parentOrganization. Imported by both /page.tsx and /shop/page.tsx; emitted as 5 sibling <script> tags. Shared fields (telephone, openingHours='Mo-Su 09:00-23:00', priceRange='AED 50 - AED 5000', image, parentOrg) live in two SHARED constants at the top of the file.
    ├── item-image.ts       # Image hotfix (PR #27): centralized fallback chain for the public site. getItemImageUrl() (with /og-image.png placeholder, for <img>) and resolveItemImageUrl() (without, for JSON-LD). Chain: thumbnail_url > image_urls[0] > worker_photo_brand_url > placeholder. Also exports getAllItemPhotos() used by resolve-schema-images.ts.
    ├── cloudinary-loader.ts        # Image hotfix (PR #27): custom next/image loader. For res.cloudinary.com URLs injects f_auto,q_<n>,w_<n>,c_limit; other URLs pass through. Wired via next.config.mjs `images.loader = 'custom'` so /_next/image is no longer in the path.
    ├── appliance-api.ts    # Client-side API wrapper for /api/appliances
    ├── appliance-catalog.ts # 12 product types, 90+ brands, legacy mapping
    ├── constants.ts        # 8 categories, shop list (thin — see shops.ts for canonical public-site shop config), WhatsApp URL builder
    ├── rate-limit.ts       # In-memory rate limiter
    ├── verify-origin.ts    # Origin/referer validation
    ├── fbpixel.ts          # Facebook Pixel
    └── lang.tsx            # EN/AR language context

lib/                        # ROOT-level (NOT src/lib). Phase 4 added this for files that need to live outside the Next.js src/ tree but still be bundled into serverless functions via outputFileTracingIncludes.
└── prompts/
    └── listing-generator-v1.md  # The locked SEO Agent v1.0 prompt. Loaded at runtime by /api/items/[id]/generate-listing via fs.readFileSync.
```

## Database Schema (Supabase)

### Core Tables

**shop_items** — Marketplace products
- Key fields: barcode, item_name, brand, product_type, category, sale_price, shop_source, image_urls[], is_published, is_sold, is_hidden, is_featured, condition, seo_title, seo_description, listing_type ('used'|'new'|null), negotiable, status ('processing'|'pending'|'published'|'agent_drafting'|'sent_back'|null)
- 67 schema-separation columns added in Phase 1 with prefixes `worker_*`, `ai_*`, `admin_*`, `published_*` — see `docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md` Phase 1B for full list.
- RLS: anon can read published items; service_role for writes

**appliance_items** — Appliance operations (THE CRITICAL TABLE)
- Key fields: barcode, product_type, brand, status, condition (working/not_working/scrap/pending_scrap/repaired), location_status (at_shop/sent_to_jurf/at_jurf/in_repair/repaired/sent_to_shop/delivered/denied), problems[], shop (A–E), photo_url, date_received, date_sent_to_jurf, tested_by, repair_notes, repair_cost, destination_shop, created_by, approval_status (pending/approved/rejected)
- Cleaning fields (added April 2026): cleaning_status (pending/in_cleaning/cleaned/legacy_skipped), cleaned_by, date_cleaning_claimed, date_cleaned, before_cleaning_photos[4 — inside/outside/front/back], after_cleaning_photos[4 — same angles], cleaning_flagged, cleaning_flag_note, cleaning_flagged_at
- RLS: service_role only

**appliance_workers** — Team roster (13 workers across SHOP/JURF/SECURITY/MANAGER tabs)
**appliance_config** — entry_code, manager_code
**shop_passwords** — Bcrypt hashed passwords per shop
**website_config** — CMS settings (hero text, WhatsApp number, etc.)
**duty_managers** — Active managers per shop
**appliance_audit_log** — Action tracking (user_name, action, item_id, details JSONB)
**audit_log** — Cross-system action tracking added in Phase 1 of the listing-generator rebuild. RLS-locked, service_role only. Phase 4 writes `ai_completed` rows; the daily cleanup cron and piggyback rescue write `cleanup_stuck_processing` rows. Phase 5's new admin pending dashboard writes `admin_approved` (with `via=detail_editor` or `via=quick_approve` and `overrides_applied`), `admin_edited`, `admin_rejected`, `admin_regenerate_triggered`. Legacy `/admin` (action='approve' on /api/admin/items) still does NOT write here — that path retires in Phase 9 once the new dashboard handles all flows.

## Listing Generator Pipeline (Phases 1–7 complete, verified May 2026)

The full pipeline turning a worker upload into a published listing on bufaisal.ae:

1. **Worker submit** (`/team` → `POST /api/team/items`) — inserts row with `status='processing'`. Fires two `waitUntil()` side effects: (a) the AI processor for THIS row, (b) `rescueStuckItems()` to clean any other stuck rows piggybacked on this submit.
2. **Phase 4 AI processor** (`POST /api/items/[id]/generate-listing`, Bearer-auth'd via `INTERNAL_API_SECRET`) — fetches the row, calls Sonnet 4.6 with the locked SEO Agent v1.0 prompt + 4 photo URLs, validates the JSON output (max 3 attempts), populates 24 `ai_*` columns, flips `status='processing'` → `'pending'`. Every failure mode (`ai_api_timeout`, `ai_json_invalid`, `ai_validation_failed`, `photo_missing`, `ai_auth_error`) still produces a `'pending'` row with the appropriate flag — items NEVER stay in `'processing'`.
3. **Cleanup safety net** — daily cron at 4am UTC + piggyback on every worker submit. Flips any `'processing'` row older than 10 min to `'pending'` with the `ai_stuck_in_processing` flag.
4. **Admin approve** (Phase 5) — primary path is `/admin/pending` → `POST /api/admin/pending/[id]/approve` (full editor) or `/quick-approve` (one-tap, server-gated on confidence ≥ 0.8 + no flags + no admin overrides). Computes `published_*` columns (`admin_*` override ?? `ai_*`), writes `published_at` + `admin_approved_*`, status → `'published'`, `is_published=true`. The legacy mirror block in `admin-pending-publish.ts` was retired in **Phase 6.6 (PR #50)** after Phases 6.5b.1 (PR #47) and 6.5b.2 (PR #49) cut every public surface over to `published_*` / canonical sources — admin approvals now write `published_*` columns exclusively. Audit log row written on every transition. Legacy `/admin` Pending tab REMOVED in PR #28 (Option B) — all approvals now route through `/admin/pending`; the legacy `/api/admin/items` action='approve' endpoint stays for direct-API-callers compatibility but has no UI surface.

5. **Public render** (Phases 6.3 + 6.4 + 6.5b) — every public surface reads `published_*` / canonical sources exclusively. `/item/[id]` renders from `published_*` columns via `resolvePublicItemFields()` (text fields, PR #40) and direct reads (JSONB fields, PR #44). `/`, `/shop`, `/categories`, `ItemCard`, `/api/feed`, and `buildWhatsAppUrl` migrated to canonical sources in 6.5b.1 (PR #47, row-based display) and 6.5b.2 (PR #49, SSR query filters). Layout sections in source order: photo gallery (main image + thumbnail strip, `worker_photo_*` chain via `item-image.ts`) → details column (category pill, condition badge, h1, brand, price + Negotiable chip, trust signals from `published_trust_signals`, description from `published_description`, optional condition notes, specifications `<table>` from `published_spec_table` with canonical key order, Photos accordion-style grid with click-to-lightbox via `yet-another-react-lightbox`, FAQ accordion from `published_faqs` as native `<details>`, optional legacy 2×2 grid when `published_spec_table` is null, desktop Negotiate CTA) → full-width Similar items grid below the 2-column section when `fetchSimilarItems()` returns ≥4 matches. Two `<script type="application/ld+json">` blocks injected in the page header: augmented `published_product_schema` (sku, canonical url, category, seller with legalName, idempotent "Price is negotiable." description hint) + verbatim `published_faq_schema`. BreadcrumbList JSON-LD also rendered. Mobile sticky Negotiate bar + floating WhatsApp circle (generic site-wide contact CTA, NOT product-specific) are page-level fixed elements.

**End-to-end verified in production 2026-05-10:** Hitachi Top-Mount Refrigerator (`4cea5546-1da6-48cb-b6c2-bf7a61232278`) approved through `/admin/pending` at 18:12:33 UTC. SQL confirmed all `published_*` columns populated correctly: `published_seo_title`, `published_description` (296 chars), `published_spec_table`, `published_faqs`, `published_trust_signals`, `published_brand`, `published_category`, `admin_approved_at`, `admin_approved_by="Admin"`. Pipeline `processing → pending → published` works end-to-end. See `docs/PHASE_STATE.md` for the full record.

**The /api/admin/pending GET route has six cache-defeat layers** (PR #34) after a 6-hour debug session uncovered that `dynamic='force-dynamic'` does NOT in practice imply `fetchCache='force-no-store'` and `revalidate=0` for routes whose internal supabase-js fetch calls go through Next's data cache. All six layers must stay: (1) `dynamic='force-dynamic'`, (2) `revalidate=0`, (3) `fetchCache='force-no-store'`, (4) `unstable_noStore()` in handler, (5) fresh supabase client per-request, (6) custom fetch wrapper passing `cache:'no-store'`. Plus Cache-Control: no-store on the response (middleware + per-route belt-and-braces).

**Image rendering:** custom next/image loader at `src/lib/cloudinary-loader.ts` rewrites `res.cloudinary.com` URLs with Cloudinary's transforms (`f_auto,q_<n>,w_<n>,c_limit`) and bypasses `/_next/image` entirely. Required because Vercel Hobby's image-optimization quota 402'd on 2026-05-09, breaking every Cloudinary thumbnail site-wide (PR #27). Public-site fallback chain centralized in `src/lib/item-image.ts`: `thumbnail_url > image_urls[0] > worker_photo_brand_url > /og-image.png`.

## Appliance State Machine

### Condition States
- `working` — Item works, ready for sale
- `not_working` — Needs repair, may need Jurf
- `scrap` — Beyond repair
- `pending_scrap` — Marked for scrap, awaiting manager approval
- `repaired` — Fixed at Jurf, ready for delivery back

### Location States
- `at_shop` — Currently at originating shop
- `sent_to_jurf` — In transit to Jurf warehouse
- `at_jurf` — Received at Jurf
- `in_repair` — Claimed by a Jurf repair worker
- `repaired` — Repair complete, item held for cleaning gate
- `sent_to_shop` — Cleaning passed, in transit to destination shop
- `delivered` / `at_shop` (post-security-accept) — Delivered to destination shop
- `denied` — Security rejected at destination, sent to manager queue

### Cleaning Gate (added April 2026)
Between `repaired` and `sent_to_shop`, every item must pass through cleaning. Cleaners are workers with role=`cleaning` (they appear in the JURF tab of `/appliances/select` and route to `/appliances/cleaning`). Cleaning requires **4 before photos** and **4 after photos** — inside, outside, front, back. The Jurf SEND tab filters out any item whose `cleaning_status !== 'cleaned'`, so a repaired-but-not-yet-cleaned item cannot be shipped. Cleaners can also ALERT MANAGER (sets `cleaning_flagged=true` with a note) if they spot a defect during cleaning.

### Typical Flow
1. Shop worker logs item IN → condition assessed → `at_shop`
2. If not_working → manager approves → sent to Jurf → `sent_to_jurf`
3. Jurf repair worker claims → `in_repair` → repairs → `condition=repaired`, `location_status=repaired`, `cleaning_status=pending`
4. Cleaner claims → `cleaning_status=in_cleaning` → captures 4 before + 4 after photos → `cleaning_status=cleaned`
5. Jurf repair worker SENDs → `sent_to_shop`, destination set
6. Security at destination accepts → `at_shop` (delivered) or denies → `denied`

### Overdue Rule
Items with location_status `sent_to_jurf` for >24 hours are flagged as overdue in the manager dashboard.

## Sacred routes

These routes are never modified without explicit user permission, even for tangential cleanup. They are operationally load-bearing, owned by other phases, or have non-obvious invariants that aren't fully captured in code.

- `/team` — worker upload portal (Phase 3 locked pill design, mobile shop-floor flow)
- `/admin` — legacy admin dashboard (settings, analytics, Live/Sold/Hidden tabs)
- `/admin/pending` — Phase 5 admin pending dashboard
- `/appliances` (and nested `/appliances/*`) — internal appliance ops system. Rename to `/appliance-tracker` is locked per Decisions Log 2026-05-01 but parked on branch `v2-migration-foundation`, not yet on main.
- `/api/appliances` — internal API for the appliance tracker
- `/api/gemini` — Claude Haiku image analysis (legacy name; serves appliance tracker barcode scan + diesel route OCR)

If a task seems to require editing any of these, stop and ask first. "Stop and ask" includes type-safety knock-ons: even a `ShopItem` interface change that propagates into `/admin` is a touch that needs approval.

## Conventions

- **UI Pattern:** Mobile-first, tap-heavy interface. Big buttons, minimal typing. Workers use phones on the shop floor.
- **Color System:** Black/yellow brand colors. Green = working/success, Orange = not working/warning, Red = scrap/error, Blue = repaired/Jurf
- **Font:** `font-heading` class for all headings (uppercase, bold)
- **API Pattern:** Single POST endpoint per domain (`/api/appliances`) with `action` field to route operations. All server-side operations use `supabaseAdmin` (service role).
- **Auth Pattern:** No JWT/session cookies. PIN hashes in env vars (admin), bcrypt in DB (shop passwords), plain text codes (entry/manager — should migrate to bcrypt).
- **Image Handling:** `browser-image-compression` in a Web Worker, target ~400KB max, max 1600px on long edge, JPEG output, uploaded directly to Cloudinary (cloud `df8y0k626`, preset `bufaisal_unsigned`). Self-hosted library at `/browser-image-compression.js`. CSP includes `worker-src 'self' blob:`.
- **Error Handling:** ErrorFlash/SuccessFlash components for user feedback. Toast pattern in manager dashboard.
- **Public-side field resolution:** Public-facing renders of `shop_items` text MUST go through `resolvePublicItemFields()` at `src/lib/resolve-public-item-fields.ts`. Never read `item.item_name`, `item.description`, `item.seo_title`, `item.brand`, `item.category`, `item.product_type`, or `item.seo_description` directly in code that ends up in the browser, OG tags, JSON-LD, or any other user-agent-visible output. The helper handles the `published_X ?? legacy_X` fallback with `??` (nullish coalescing — NEVER `||`, an empty string on `published_*` is an intentional admin blank, not "missing"). The legacy text columns are no longer written on approval (Phase 6.6 retired the mirror); the resolver still serves any pre-Phase-5 rows via the fallback. Helper retires once the legacy columns are dropped from `shop_items` (Phase 9+).
- **Resolver-per-concern pattern (locked Phase 6.4):** Each public-side concern over `shop_items` lives in its own file in `src/lib/`. Current set: `resolve-public-item-fields.ts` (text fields), `resolve-schema-images.ts` (substitute placeholder `image[]` in stored schema at publish time), `augment-product-schema.ts` (page-level SEO augmentation at render time), `similar-items.ts` (tiered related-products query). New concerns get their own file rather than bloating an existing resolver. Pure functions wherever possible — no DB calls in render-time augmenters, no React in pure utilities.
- **Render-time SEO augmentation is non-destructive.** `augmentProductSchema()` only fills gaps in the stored schema — it never overwrites a key the AI or admin already emitted. Page-level fields the AI cannot know (canonical URL, sku, seller block) live in the augmenter. Storage stays clean; one source of truth for SEO output.
- **Negotiable source (locked Phase 6.4 PR A):** read `item.admin_negotiable ?? item.worker_negotiable` for public-site display + schema. The legacy `item.negotiable` column is no longer written by admin approval (Phase 6.6 retired the mirror) but stays populated at worker insert; do not introduce new readers against the legacy column.
- **Negotiate-everywhere CTA labeling (locked Phase 6.4 PR B):** every product-specific CTA on `/item/[id]` says **"Negotiate"** (Architecture doc 2.1). Desktop inline + mobile sticky buttons are product-specific and labeled NEGOTIATE. The floating green WhatsApp circle bottom-right is a generic site-wide contact CTA — stays as-is, NOT product-specific, not relabeled. `buildWhatsAppUrl()` already prefills the message with "want to negotiate" so the button label matches the prefilled tone.
- **Similar items cards are pure navigation.** Co-located `SimilarItemCard` in `src/app/item/[id]/item-detail-client.tsx` — single `<a href="/item/UUID">`, no per-card WhatsApp button. Reason: per-card WhatsApp on a "you might also like" grid opens chat about the wrong product (cognitive split with the page-level CTA) and creates 6–8 yellow CTA tiles of visual noise. The site-wide `ItemCard` in `src/components/` keeps its per-card WhatsApp button for homepage / shop feeds — those are conversion surfaces, similar-items grids are navigation surfaces.
- **Tiered similar-items query pattern (locked Phase 6.4 PR B):** `src/lib/similar-items.ts` runs Tier 1 (same brand + same category) → Tier 2 (same category + same shop) → Tier 3 (same category overall). Within each tier order by `published_at DESC` (freshness). Dedupe across tiers by id. Target = 8, MIN_THRESHOLD = 4 → return `[]` (hide section) when fewer than 4 matches. Filter columns are `published_brand` / `published_category` — the canonical sources after the Phase 6.5b SSR-filter cutover.
- **Sparse-render hide thresholds:** Photo gallery section on `/item/[id]` hides if fewer than 2 valid `worker_photo_*` URLs. Similar items section hides if fewer than 4 matches. No empty-state placeholders, no "no similar items found" copy — silent suppression keeps the page tight.
- **Photo gallery uses `worker_photo_*` directly (canonical):** the Phase 6.4 PR B Photos grid sources `worker_photo_brand_url`, `worker_photo_2_url`, `worker_photo_3_url`, `worker_photo_barcode_url` in that order. NOT the legacy `image_urls > thumbnail_url > worker_photo_brand_url` chain — that fallback is for thumbnails / OG / single-image consumers via `item-image.ts`. The four canonical columns are positionally aligned with `published_image_alt_texts[i]`.
- **Spec-table canonical key order (locked Phase 6.4 PR A):** `Brand → Condition → Item Type → Capacity → Configuration → Color → Location → Delivery → then any remaining keys in insertion order`. Implemented by `orderSpecRows()` in `item-detail-client.tsx`. The "Location" row is rendered as a clickable Google Maps GBP link (via `getShop(worker_shop_id)`) when the shop has a `mapUrl`, plain text otherwise.
- **Seller block in Product JSON-LD includes legalName:** `{ '@type': 'Organization', name: 'Bufaisal', legalName: 'Bu Faisal General Trading LLC' }`. Trading name is customer-facing ("Bufaisal"), legal entity is machine-readable for SEO + Knowledge Panel + compliance (Decisions Log 2026-05-01 brand lock). Injected via `augmentProductSchema()`.
- **Alt-text fallback for photo gallery:** when `published_image_alt_texts[i]` is null, fall back to `"Product photo {i+1}"` — better screen-reader output than four identical product-name alts. (Distinct from the main hero `<Image alt>` rule below which uses the item name.)
- **Alt-text fallback:** Product `<Image alt>` and OG `image.alt` use `alt={f.itemName ?? 'Product image'}`. Never empty string — `alt=""` is the HTML convention for *decorative* images and tells assistive tech to skip them. Product photos are primary content.
- **JSON-LD script injection safety (locked Phase 6.4 PR A):** every `dangerouslySetInnerHTML` JSON-LD payload runs through an `escapeJsonLd()` helper that rewrites `</script>` to `<\/script>` (regex `/<\/(script)/gi → <\\/$1`) and then escapes remaining `<` to `<` as defense in depth. Prevents script-tag breakout from any user/AI-supplied schema content. Current consumer: `src/app/item/[id]/page.tsx`. Five other inline JSON-LD sites in the repo duplicate the simpler `replace(/</g, '\\u003c')` pattern — they predate this rule and should be migrated when next touched.
- **Lightbox library over hand-rolled for customer-facing image viewers:** `yet-another-react-lightbox@^3` (~30 KB gzipped) ships built-in focus trap, Escape key, keyboard arrow nav, body scroll lock, `aria-modal`. The repo's lean-dependency preference is correct for internal tools but accessibility-grade UX on commerce surfaces (where it's a legal-compliance and SEO concern) justifies the library. Internal-only modals (`PhotosModal` in `/appliances/manager/components/CleaningActivity.tsx`, the various admin dialogs) stay bespoke.
- **Sparse-inventory note for Phase 6+ public-facing sections:** layout patterns gated on "≥ N matching rows" (similar items, future related sections) will silently not render on production today — visible inventory is 3 rows. Verify rendering by temporarily lowering the threshold locally; never lower it in production code. Visual verification was done for PR #45 with threshold=2 → confirmed 2-card render correct → threshold restored to 4 before commit.
- **"Display" includes everything any user-agent reads:** When deciding whether something is in-scope for a `published_*` cutover, treat *display* as: visible text, meta tags (`<title>`, description, OG, Twitter), JSON-LD, `alt` attributes, ARIA labels, screen-reader output. *Non-display* is: server-side filter/search columns (`where category=…`, `ilike` searches), analytics payloads (FB Pixel `trackViewContent` / `trackWhatsAppClick`), IDs, FK references, internal logs.
- **Cutover-PR scope discipline:** Data-layer cutover PRs (legacy column → new column) must enumerate "in scope" and "out of scope" files in the PR body. Recurring out-of-scope buckets to call out by name: analytics calls (FB Pixel `trackViewContent` / `trackWhatsAppClick`), breadcrumb JSON-LD when explicitly locked inline, image-URL resolution when no `published_*` counterpart exists, and the legacy `/admin` UI (sacred — separate migration). The Phase 6.5b cutover (PRs #47, #49) and Phase 6.6 mirror deletion (PR #50) handled the public-site cuts for `ilike` search columns, `buildWhatsAppUrl` outbound message body, and `/api/feed`.

## Phase 6 cutover snapshot (complete 2026-05-12)

Phase 6.5 is COMPLETE. The public site reads `published_*` / canonical sources (`admin_*?? worker_*`, `ai_*`, `getShop()`) end-to-end. No public surface reads any legacy mirror column on `shop_items` anywhere. The legacy mirror block in `admin-pending-publish.ts` was deleted in Phase 6.6 (PR #50); admin approvals write `published_*` columns exclusively. Legacy text columns on `shop_items` are kept in the table for backward compatibility with pre-Phase-5 rows; column drop is scheduled for Phase 9 or later.

### ShopItem interface fields added during Phases 6.3 + 6.4 + 6.5b.1

All additive, nullable, no field renames. Per CLAUDE.md ripple rule the `ShopItem` interface ripples into `/admin` consumers — these additions caused zero behavior change because admin code reads existing legacy columns. Document for future sessions:

| Field | Type | Source | Added in |
|---|---|---|---|
| `worker_negotiable` | `boolean \| null` | Worker upload | PR #44 (formalized for resolver use) |
| `admin_negotiable` | `boolean \| null` | Admin override at approve time | PR #44 |
| `worker_shop_id` | `string \| null` (`'BF1'..'BF5'`) | Worker upload (token-derived) | PR #45 |
| `published_item_name` | `string \| null` | Publish snapshot | Phase 6.3 / PR #40 |
| `published_brand` | `string \| null` | Publish snapshot | Phase 6.3 / PR #40 |
| `published_category` | `string \| null` | Publish snapshot | Phase 6.3 / PR #40 |
| `published_product_type` | `string \| null` | Publish snapshot | Phase 6.3 / PR #40 |
| `published_description` | `string \| null` | Publish snapshot | Phase 6.3 / PR #40 |
| `published_seo_title` | `string \| null` | Publish snapshot | Phase 6.3 / PR #40 |
| `published_meta_description` | `string \| null` | Publish snapshot. Column-name mismatch (`seo_description` legacy ↔ `published_meta_description` new) is intentional per Decisions Log v1.1 — don't "fix" it. | Phase 6.3 / PR #40 |
| `published_product_schema` | `Record<string, unknown> \| null` | Publish snapshot (JSONB) | PR #44 |
| `published_faq_schema` | `Record<string, unknown> \| null` | Publish snapshot (JSONB) | PR #44 |
| `published_spec_table` | `Record<string, string> \| null` | Publish snapshot (JSONB) | PR #44 |
| `published_faqs` | `Array<{question, answer}> \| null` | Publish snapshot (JSONB) | PR #44 |
| `published_trust_signals` | `string[] \| null` | Publish snapshot (JSONB) | PR #44 |
| `published_image_alt_texts` | `string[] \| null` | Publish snapshot — positionally aligned with the 4 `worker_photo_*` columns | PR #45 |
| `worker_condition_type` | `'Used' \| 'New' \| null` | Worker upload (`/team` Used/New choice) | PR #47 (Phase 6.5b.1) |
| `worker_condition_grade` | `'Excellent' \| 'Good' \| 'Fair' \| null` | Worker upload (`/team` grade choice for Used) | PR #47 |
| `admin_condition_grade` | `'Excellent' \| 'Good' \| 'Fair' \| null` | Admin override at approve time | PR #47 |
| `ai_barcode_extracted` | `string \| null` | AI extraction from barcode photo | PR #47 |

**Known gap:** no `admin_condition_type` override column exists. If admin ever needs to flip Used↔New at approve time, a future schema migration adds the column and the public-side read pattern becomes `admin_condition_type ?? worker_condition_type` (currently `mapCondition()` in `/api/feed/route.ts` reads only `worker_condition_type`).

`published_internal_link_targets` is referenced in `admin-pending-publish.ts` override keys but the column **does not exist** in the migration. PR #45 deliberately did not add it — derives similar-item tiers from `published_brand`/`published_category`/`worker_shop_id` instead, which carry the same information without a redundant JSONB column. Cleanup of the dangling override-key reference is a Phase 9 housekeeping item.

### Phase 6.5b/6.6 operational notes (Hamzah Option A acceptance — 2026-05-12)

These regressions were considered during the 6.6 audit and explicitly accepted. Future sessions should treat them as the operational reality, not bugs to fix unprompted:

- **Legacy `/admin` Live/Sold/Hidden tabs** render items approved after 6.6 with blank product titles, empty categories, and no condition badges. `AdminItems.tsx` reads `item.item_name`, `item.category`, `item.condition` directly. After 6.6 those columns are `''` / `''` / `null` for new approvals (worker insert sets the NOT NULL columns to empty strings; the mirror that used to fill them is gone). Acceptable because the locked workflow is `/admin/pending` and items remain identifiable by photo + price + shop badge. Migration of legacy `/admin` to canonical sources deferred to Phase 9 or a dedicated cleanup PR.
- **Legacy `/admin` Edit form** (`action='edit'` at `src/app/api/admin/items/route.ts:180-199`) still writes to legacy columns only. Those edits no longer surface on the public site. Admins should use `/admin/pending` re-approval flow for edits that need to reach customers.
- **`admin_price_aed` and `admin_negotiable` overrides don't propagate to the public site.** Worker insert populates `sale_price` and `negotiable` once at submit; the mirror block (now deleted) was the only writer that overwrote them with the admin override on approval. With the mirror gone, those overrides stop at the `admin_*` column. Public site continues to render the worker-submitted price and negotiable flag. Fix scoped for a future PR if/when admin overrides become an active workflow need.

### New dependencies added in Phase 6.4

- `yet-another-react-lightbox@^3` (~30 KB gzipped) — first image-display library in the repo. Imported only by `src/app/item/[id]/item-detail-client.tsx` for the customer-facing photo lightbox. Chosen over hand-rolled for built-in accessibility (focus trap, Escape, keyboard arrow nav, `aria-modal`, body scroll lock).

### SEO state as of 2026-05-12 (Hitachi reference row)

Google Rich Results Test on `/item/4cea5546-1da6-48cb-b6c2-bf7a61232278` returns **5 valid schema items**: Product snippets, Merchant listings, Breadcrumbs, FAQ, Organization. With Phase 6.5 / 6.6 complete, the public site is now positioned for the next architectural phase: SEO / AEO / GEO schema upgrades. Recommended ordering for the deferred warnings:

1. **Organization-level `aggregateRating`** — highest-visibility first win. Lifts the 2,390+ Google reviews across the 5 shops into the Organization schema, lights up gold stars next to "Bufaisal" in Google search, and unblocks both the Product / Merchant snippets warnings simultaneously. Store-level reviews are the correct pattern for used-goods marketplaces (per-product reviews don't scale and don't match Bufaisal's catalog turnover). One-file change in `src/app/page.tsx` Organization schema block.
2. **`ItemList` JSON-LD on `/shop`** — currently emitted client-side in `shop-client.tsx:163-193`; move to SSR so crawlers see it in initial HTML.
3. **`CollectionPage` schema on `/categories`** — adds machine-readable structure to the 8-category landing page.
4. **Merchant Listings `shippingDetails` + `hasMerchantReturnPolicy`** — unlocks Google Shopping eligibility. Goes into `augmentProductSchema()` at render time.
5. **Organization `postalCode` + `streetAddress`** — fills the remaining Organization warning.

See `.claude/handoffs/2026-05-12-post-6.6-seo-upgrades-start.md` for the full next-session brief.

## Phase 7 — Complete (2026-05-14)

Phase 7 widened the structured-data surface for SEO / AEO / GEO. Full context: [`docs/phase-7-handoff.md`](docs/phase-7-handoff.md). Per-PR audits: [`docs/phase-7-schema-audit.md`](docs/phase-7-schema-audit.md) (the inventory that opened the phase), plus one audit per PR (`docs/phase-7-pr53-audit.md` through `docs/phase-7-pr56-audit.md`).

### 4 PRs merged

- **PR [#52](https://github.com/nonstophamzah/bufaisal-website/pull/52) — Merchant Listings eligibility.** Added `shippingDetails` (array of 7 per-emirate entries) + `hasMerchantReturnPolicy` (Appliances-only, 7-day finite window, `ReturnInStore` + `FreeReturn`) to Product JSON-LD via `augmentProductSchema()`. Both nest under `Offer`. 11 vitest cases in `src/__tests__/lib/augment-product-schema.test.ts`. Per-emirate rates: Ajman 85 / Sharjah 145 / Umm Al Quwain 120 / Dubai 240 / Ras Al Khaimah 240 / Fujairah 265 / Abu Dhabi 300 AED.
- **PR [#53](https://github.com/nonstophamzah/bufaisal-website/pull/53) — 5-shop LocalBusiness split + Organization address.** Replaced the single collapsed LocalBusiness with 5 sibling entities (per-shop geo + GBP-sourced `aggregateRating` for 1,442 / 281 / 582 / 47 / 49 reviews = **2,401 total**). Added missing `streetAddress` + `addressRegion` + `postalCode='00000'` to root Organization in `layout.tsx`. Fixed pre-existing bugs: `openingHours` 22:00 → 23:00, `priceRange` `'AED'` → `'AED 50 - AED 5000'`. Data lives in `src/lib/local-business-schema.ts`.
- **PR [#54](https://github.com/nonstophamzah/bufaisal-website/pull/54) — ItemList SSR migration.** Moved `ItemList` JSON-LD on `/shop?category=*` from client-side to server-side; deleted the CSR `useMemo` in `shop-client.tsx` in the same commit. `/shop` only — homepage `?category=` no longer emits ItemList as a side effect of the shared `ShopClient` deletion (Hamzah-accepted). Shape is byte-identical to prior CSR.
- **PR [#55](https://github.com/nonstophamzah/bufaisal-website/pull/55) — BreadcrumbList on /categories.** 2-level breadcrumb (Home → Categories). Position 2 carries `name` only, no `item` URL — matches the leaf convention in `/item/[id]/page.tsx`. Closes the schema gap the original Phase 7 inventory flagged.

### 2 proposals rejected as vanity schema

- **Organization-level `aggregateRating`** — Google doesn't honor self-declared aggregateRating on Organization for SERP rich results (pulls from its own GBP data). Per-shop aggregateRating on LocalBusiness handles the 2,401 reviews instead. Rejected in PR #53's audit (`docs/phase-7-pr54-audit.md` Section 3).
- **CollectionPage on `/categories`** — not in Google's rich-results gallery, no documented SERP benefit, no measurable AEO/GEO impact. Rejected in PR #56's audit (`docs/phase-7-pr56-audit.md` Section 5 explicit SKIP verdict); BreadcrumbList shipped alone as the audit-approved minimum fix.

### Schema emission map (post-Phase-7)

All page-level schemas are server-side emitted. No client-side JSON-LD remains in the codebase.

| Route | SSR JSON-LD blocks |
|---|---|
| `/` | Organization + WebSite (inherited from `layout.tsx`); FAQPage |
| `/shop` | Organization + WebSite (inherited); 5× LocalBusiness; FAQPage |
| `/shop?category=*` | Same as `/shop` + ItemList for the category |
| `/categories` | Organization + WebSite (inherited); BreadcrumbList |
| `/item/[id]` | Organization + WebSite (inherited); augmented Product (with sku, url, category, seller, shippingDetails[7], hasMerchantReturnPolicy if Appliances); FAQPage; BreadcrumbList |

`/item/[id]` uses the locked `escapeJsonLd()` helper for script-tag breakout safety. Five other inline JSON-LD sites still use the simpler `replace(/</g, '\\u003c')` pattern (`layout.tsx`, `page.tsx`, `shop/page.tsx`, `categories/page.tsx`) — migrate when next touching those files; not urgent.

### Sacred routes — unchanged from Phase 6.6

Same list applies; reaffirmed for Phase 7. The Phase 7 PRs all stayed within the public-marketplace schema surface. `/team`, `/admin`, `/admin/pending`, `/appliances`, `/api/appliances`, `/api/gemini` were not touched.

### Known operational state (Phase 7 carry-forward)

- **3 of 49 visible rows have stored Product JSON-LD** — the 46 pre-Phase-5 legacy rows have `published_product_schema = NULL` and emit no Product block at all on `/item/[id]`. PR #52's shipping + return policy additions only land on rows that already have Product schema. Backfilling the 46 legacy rows (via `src/scripts/process-backlog.ts --force`) is the single biggest carry-forward SEO opportunity — see `docs/phase-7-handoff.md` Section 6.
- **`admin_price_aed` and `admin_negotiable` overrides remain dormant** — public site renders worker-submitted price + negotiable flag. Carry-over from Phase 6.6's mirror deletion. Fix scoped when admin overrides become an active workflow.
- **Legacy `/admin` Live/Sold/Hidden tabs still render new approvals with blank `item_name` / `category` / `condition`** — locked workflow is `/admin/pending`. Cleanup deferred to Phase 9.
- **Shops D + E share GPS coordinates** (`25.3994663, 55.4993168`) in `local-business-schema.ts` — physically adjacent units; distinct names + `sameAs` GBP URLs disambiguate them for Google.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ADMIN_PIN_HASHES          # JSON array: [{"hash":"$2a$10$...","name":"Admin"}]
NEXT_PUBLIC_FB_PIXEL_ID
NEXT_PUBLIC_WHATSAPP_NUMBER
NEXT_PUBLIC_BASE_URL      # Phase 4: e.g. https://bufaisal.ae. Used by /api/team/items to call /api/items/[id]/generate-listing internally.
INTERNAL_API_SECRET       # Phase 4: random 40-char string. Bearer auth for /api/items/[id]/generate-listing AND /api/cron/cleanup-stuck-processing.
JOBS_SECRET               # LEGACY: still set, used only by the no-longer-called /api/jobs/generate-listing. Safe to remove in Phase 9 cleanup.
CRON_SECRET               # OPTIONAL: if set in Vercel env, Vercel auto-injects Authorization: Bearer ${CRON_SECRET} on cron triggers. The cron route accepts CRON_SECRET OR INTERNAL_API_SECRET.
```

## Known Issues / Tech Debt (From Full Audit — April 2026)

### SECURITY CRITICAL
1. **shop_items RLS is WIDE OPEN for writes** — anon key can INSERT/UPDATE/DELETE any item. Admin page uses anon client directly instead of API routes. MUST create server-side API routes and lock RLS to SELECT only.
2. **website_config RLS allows anon UPDATE** — anyone can change site settings. Same fix needed.
3. **Gemini endpoint accepts custom prompts from client** — remove `customPrompt`, define all prompts server-side.
4. **Plain text password column still exists** in shop_passwords table — drop it.
- (Items #5 "No middleware.ts" and #6 "No CSP header" from the original audit are now resolved — `src/middleware.ts` exists and CSP is set in `next.config.mjs`. Numbering preserved below for traceability with the original audit doc.)

### ARCHITECTURE
7. **Admin page uses anon Supabase client for CRUD** — must move to API routes like appliance tracker does.
8. **Monster files:** admin/page.tsx (~1200 lines), manager/page.tsx (~600 lines) — need component extraction.
9. **No error boundaries** — unhandled errors crash entire pages.
10. **Inconsistent API pattern** — appliance tracker uses API routes (good), marketplace uses direct Supabase from client (bad).

### SEO
11. **No JSON-LD structured data** on product pages — Google doesn't know these are products.
12. **No LocalBusiness schema** — Google doesn't know you have 5 physical shops.
13. **Sitemap includes /team** (private) but excludes /about and /categories (public).

### PERFORMANCE
14. **N+1 queries on categories page** — 8 sequential queries instead of 1 GROUP BY.
15. **Client-side filtering** — loads 200 items then filters in browser.
16. **Sequential Gemini calls** — should be parallel with Promise.all().

### AGENT-READINESS
17. **No state transition validation on appliance_items** — API accepts any update, no business rule enforcement. (shop_items state machine is now constrained; appliance_items still wide-open.)
18. **No AI auto-fill on appliance intake** — workers manually select everything. Separate from the listing-generator pipeline; appliance tracker still has a typed-input flow.
19. **No end states defined** for appliance_items — items sit in "delivered" forever.
20. **No duplicate barcode detection** on insert.
21. **Phantom states in SQL** — migration defines ready_to_sell, sold, scrapped but code doesn't use them.

### OTHER
22. **Entry/manager codes are plain text** — should migrate to bcrypt.
23. **Rate limiter is in-memory** — resets on Vercel deploy.
24. **No tests** — zero test coverage.
25. **SQL migrations dumped in root** — 12 loose .sql files, no migration tool.
26. **No error monitoring** — no Sentry or equivalent.

See `FULL-AUDIT-bufaisal-platform.md` for the complete 47-issue audit with priority action plan.

### Open follow-up issues filed 2026-05-12 (not blocking Phase 6.7+)

- **[Issue #48](https://github.com/nonstophamzah/bufaisal-website/issues/48) — WhatsApp draft emoji rendering broken** (pre-existing). Draft body shows replacement chars (�) instead of 📦 💰 📍 on WhatsApp Web. Source bytes verified byte-identical to correct UTF-8 (`F0 9F 93 A6` etc.) and unchanged across Phase 6.5b.1; cause is downstream — likely `encodeURIComponent` interaction with `wa.me` handler, or font/rendering on certain client OS. Low priority.
- **Unescaped user input in `.or(…ilike…)` interpolation** at `src/app/page.tsx`, `src/app/shop/page.tsx`, `src/app/shop/shop-client.tsx`. PostgREST escapes URL operands but `,` or `)` in the search term could in theory confuse the filter parser. Low-severity hardening.
- **`condition_notes` has no `published_*` counterpart.** `/item/[id]` reads `item.condition_notes` directly. Worker-controlled free-text field; can stay legacy.
- **Image gallery fallback chain still reads `image_urls` / `thumbnail_url`.** Image-resolution is its own concern (`src/lib/item-image.ts`), distinct from the text canonicalization story.
- **Production baseline (2026-05-12, end of Phase 6.5):** 49 publicly visible rows (`is_published=true AND is_sold=false AND is_hidden=false`), 0 pending awaiting admin approval, 4 hidden, **122 total rows** in `shop_items`. Per-category map for the 49 visible: Appliances 6, Bedroom & Sleep 12, Everyday Essentials 1, Kids & Baby 1, Kitchen & Dining 9, Living Room & Lounge 16, Office Study & Fitness 2, Outdoor & Garden 2. "hitachi" ilike search returns 1 match. Reference baseline for any future cutover that touches public query filters — capture and verify against it the same way 6.5b.2 did.

## What NOT To Do

- Don't use `supabase` (anon client) for writes — always use `supabaseAdmin` on the server
- Don't add new pages without mobile-first responsive design
- Don't hardcode shop names — they come from constants.ts or website_config
- Don't skip rate limiting on new API routes
- Don't create new Supabase tables without RLS policies
- Don't use localStorage for auth state — use sessionStorage (clears on tab close)

## Session discipline

### Memory & handoff discipline

Every session must maintain its own audit trail without being prompted:

1. **At session start:** read `.claude/handoffs/` for the most recent handoff file. If one exists for an in-progress phase, follow it. If unclear, ask Hamzah before proceeding.

2. **During the session:** after any significant change is shipped (PR merged, migration applied, configuration changed), update CLAUDE.md's relevant sections inline — don't wait until session end. Stale CLAUDE.md content is worse than missing content because it actively misleads future sessions.

3. **At session end (or before context window gets risky):** write a new handoff file at `.claude/handoffs/YYYY-MM-DD-phase-X.Y-start.md` covering:
   - Current branch and clean-state confirmation
   - What shipped this session (commit SHAs)
   - What the next sub-step will do
   - Files the next session must read first
   - Subtleties carried forward (deviations, gotchas, parked branches, anything non-obvious)

   Replace the "## Last session handoff" section in CLAUDE.md with a pointer to the new handoff file.

4. **Commit and push the handoff before closing.** An uncommitted handoff is useless — the next session won't have access to it unless it's on origin.

5. **Anything that surprised you this session goes in the handoff.** Future you (or future Claude Code) will need that context. Examples from prior sessions: the `.maybeSingle()` deviation reasoning, the `.gitignore` `.claude/*` carve-out, the no-CLI migration workflow, the diesel WIP parked branch.

The handoff convention is the load-bearing piece that keeps Phase 6 (and future multi-session work) coherent across context resets. Treat it like production code, not optional housekeeping.

## Documentation policy

Significant changes (new features, architectural decisions, schema migrations, locked-in conventions, AI behavior changes) require documentation updates as part of the PR. Doc updates are part of "done."

In-repo docs — update in the same PR:
- CLAUDE.md — extends the inline-update rule from Session discipline
- lib/prompts/*.md — when AI behavior changes
- docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md — when phase status or implementation details change
- PR description itself — explain what changed and why

External docs — out of repo, but noted in the PR description:
- Bufaisal-Decisions-Log .docx — for locked strategy decisions
- Bufaisal-Website-Architecture .docx — for architectural changes
- Bufaisal-SEO-Agent .docx — for AI behavior / output rule changes

When a PR triggers an external doc update, add a section to the PR description titled "External doc update required" listing which .docx files need updating and what to add. Hamzah maintains the .docx files in his next editing session.

Tiny PRs (typo fixes, dependency bumps, formatting) skip doc updates. Use judgment: if the next Claude Code session would be confused by code that contradicts the docs, the docs need updating.

## Last session handoff

- **2026-05-14** — Phase 7 COMPLETE. Four PRs merged in three days: PR #52 (Merchant Listings — shippingDetails[7] + hasMerchantReturnPolicy), PR #53 (5-shop LocalBusiness split + Org address completeness), PR #54 (ItemList SSR migration on `/shop`), PR #55 (BreadcrumbList on `/categories`). Two proposals explicitly rejected as vanity schema: Organization-level `aggregateRating` (Google doesn't honor it for SERP) and CollectionPage on `/categories` (not in rich-results gallery). 2,401 GBP reviews now surfaced via per-shop LocalBusiness aggregateRating.
- Next session: passive — let Phase 7 land in Google Search Console for 30 days before adding more schema. Ranked post-Phase-7 options in [`docs/phase-7-handoff.md`](docs/phase-7-handoff.md) Section 6. Highest material lift is backfilling the 46 legacy rows that lack `published_product_schema` (3 → 49 rows with Product JSON-LD); easiest small win is fixing the WhatsApp emoji bug ([Issue #48](https://github.com/nonstophamzah/bufaisal-website/issues/48)).
