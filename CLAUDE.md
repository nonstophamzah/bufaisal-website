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
    ├── admin-pending-publish.ts    # Phase 5: server-only helpers — buildPublishUpdate() (computes published_* + the marked "Phase 6 bridge — remove when public site reads published_* directly" legacy mirror) and writeAdminAudit().
    ├── item-image.ts       # Image hotfix (PR #27): centralized fallback chain for the public site. getItemImageUrl() (with /og-image.png placeholder, for <img>) and resolveItemImageUrl() (without, for JSON-LD). Chain: thumbnail_url > image_urls[0] > worker_photo_brand_url > placeholder.
    ├── cloudinary-loader.ts        # Image hotfix (PR #27): custom next/image loader. For res.cloudinary.com URLs injects f_auto,q_<n>,w_<n>,c_limit; other URLs pass through. Wired via next.config.mjs `images.loader = 'custom'` so /_next/image is no longer in the path.
    ├── appliance-api.ts    # Client-side API wrapper for /api/appliances
    ├── appliance-catalog.ts # 12 product types, 90+ brands, legacy mapping
    ├── constants.ts        # 8 categories, shop list, WhatsApp URL builder
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

## Listing Generator Pipeline (Phases 1–5 complete and verified, May 2026)

The full pipeline turning a worker upload into a published listing on bufaisal.ae:

1. **Worker submit** (`/team` → `POST /api/team/items`) — inserts row with `status='processing'`. Fires two `waitUntil()` side effects: (a) the AI processor for THIS row, (b) `rescueStuckItems()` to clean any other stuck rows piggybacked on this submit.
2. **Phase 4 AI processor** (`POST /api/items/[id]/generate-listing`, Bearer-auth'd via `INTERNAL_API_SECRET`) — fetches the row, calls Sonnet 4.6 with the locked SEO Agent v1.0 prompt + 4 photo URLs, validates the JSON output (max 3 attempts), populates 24 `ai_*` columns, flips `status='processing'` → `'pending'`. Every failure mode (`ai_api_timeout`, `ai_json_invalid`, `ai_validation_failed`, `photo_missing`, `ai_auth_error`) still produces a `'pending'` row with the appropriate flag — items NEVER stay in `'processing'`.
3. **Cleanup safety net** — daily cron at 4am UTC + piggyback on every worker submit. Flips any `'processing'` row older than 10 min to `'pending'` with the `ai_stuck_in_processing` flag.
4. **Admin approve** (Phase 5) — primary path is `/admin/pending` → `POST /api/admin/pending/[id]/approve` (full editor) or `/quick-approve` (one-tap, server-gated on confidence ≥ 0.8 + no flags + no admin overrides). Computes `published_*` columns (`admin_*` override ?? `ai_*`), writes `published_at` + `admin_approved_*`, status → `'published'`, `is_published=true`, AND mirrors into the legacy columns the public site reads (`item_name, brand, category, condition, sale_price, description, seo_title, seo_description, negotiable, product_type, barcode`). The mirror block in `src/lib/admin-pending-publish.ts` is explicitly marked **"Phase 6 bridge — remove when public site reads published_* directly"** — without it, every Phase 5-published row would render blank on bufaisal.ae because worker submit inserts empty strings into the legacy NOT NULL columns. Audit log row written on every transition. Legacy `/admin` Pending tab REMOVED in PR #28 (Option B) — all approvals now route through `/admin/pending`; the legacy `/api/admin/items` action='approve' endpoint stays for direct-API-callers compatibility but has no UI surface.

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

## Conventions

- **UI Pattern:** Mobile-first, tap-heavy interface. Big buttons, minimal typing. Workers use phones on the shop floor.
- **Color System:** Black/yellow brand colors. Green = working/success, Orange = not working/warning, Red = scrap/error, Blue = repaired/Jurf
- **Font:** `font-heading` class for all headings (uppercase, bold)
- **API Pattern:** Single POST endpoint per domain (`/api/appliances`) with `action` field to route operations. All server-side operations use `supabaseAdmin` (service role).
- **Auth Pattern:** No JWT/session cookies. PIN hashes in env vars (admin), bcrypt in DB (shop passwords), plain text codes (entry/manager — should migrate to bcrypt).
- **Image Handling:** `browser-image-compression` in a Web Worker, target ~400KB max, max 1600px on long edge, JPEG output, uploaded directly to Cloudinary (cloud `df8y0k626`, preset `bufaisal_unsigned`). Self-hosted library at `/browser-image-compression.js`. CSP includes `worker-src 'self' blob:`.
- **Error Handling:** ErrorFlash/SuccessFlash components for user feedback. Toast pattern in manager dashboard.

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

## What NOT To Do

- Don't use `supabase` (anon client) for writes — always use `supabaseAdmin` on the server
- Don't add new pages without mobile-first responsive design
- Don't hardcode shop names — they come from constants.ts or website_config
- Don't skip rate limiting on new API routes
- Don't create new Supabase tables without RLS policies
- Don't use localStorage for auth state — use sessionStorage (clears on tab close)
