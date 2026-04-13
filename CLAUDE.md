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
- **AI:** Google Gemini 2.5-flash-lite (image analysis: barcode reading, item identification)
- **Images:** Cloudinary (uploads), Supabase Storage, Unsplash (category cards)
- **Hosting:** Vercel
- **Analytics:** Facebook Pixel

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Marketplace homepage (category pills, product grid)
│   ├── item/[id]/          # Product detail pages (SSR metadata)
│   ├── team/               # Upload portal (shop password → name → photo upload → Gemini auto-fill)
│   ├── admin/              # Admin dashboard (approve/reject items, settings, analytics)
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
│       ├── gemini/         # Gemini AI image analysis
│       └── track-click/    # WhatsApp click tracking
├── components/             # Shared UI (Navbar, Hero, ItemCard, Footer, WhatsAppFloat)
└── lib/
    ├── supabase.ts         # Anon client + TypeScript interfaces
    ├── supabase-admin.ts   # Service role client (server-side only)
    ├── appliance-api.ts    # Client-side API wrapper for /api/appliances
    ├── appliance-catalog.ts # 12 product types, 90+ brands, legacy mapping
    ├── constants.ts        # 8 categories, shop list, WhatsApp URL builder
    ├── rate-limit.ts       # In-memory rate limiter
    ├── verify-origin.ts    # Origin/referer validation
    ├── fbpixel.ts          # Facebook Pixel
    └── lang.tsx            # EN/AR language context
```

## Database Schema (Supabase)

### Core Tables

**shop_items** — Marketplace products
- Key fields: barcode, item_name, brand, product_type, category, sale_price, shop_source, image_urls[], is_published, is_sold, is_hidden, is_featured, condition, seo_title, seo_description
- RLS: anon can read published items; service_role for writes

**appliance_items** — Appliance operations (THE CRITICAL TABLE)
- Key fields: barcode, product_type, brand, status, condition (working/not_working/scrap/pending_scrap/repaired), location_status (at_shop/sent_to_jurf/at_jurf/delivered), problems[], shop (A–E), photo_url, date_received, date_sent_to_jurf, tested_by, repair_notes, repair_cost, destination_shop, created_by, approval_status (pending/approved/rejected)
- RLS: service_role only

**appliance_workers** — Team roster (13 workers across SHOP/JURF/SECURITY/MANAGER tabs)
**appliance_config** — entry_code, manager_code
**shop_passwords** — Bcrypt hashed passwords per shop
**website_config** — CMS settings (hero text, WhatsApp number, etc.)
**duty_managers** — Active managers per shop
**appliance_audit_log** — Action tracking (user_name, action, item_id, details JSONB)

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
- `delivered` — Delivered to destination shop

### Typical Flow
1. Shop worker logs item IN → condition assessed → `at_shop`
2. If not_working → manager approves → sent to Jurf → `sent_to_jurf`
3. Jurf team receives → `at_jurf` → repairs → condition becomes `repaired`
4. Delivery picks up → `delivered` to destination shop

### Overdue Rule
Items with location_status `sent_to_jurf` for >24 hours are flagged as overdue in the manager dashboard.

## Conventions

- **UI Pattern:** Mobile-first, tap-heavy interface. Big buttons, minimal typing. Workers use phones on the shop floor.
- **Color System:** Black/yellow brand colors. Green = working/success, Orange = not working/warning, Red = scrap/error, Blue = repaired/Jurf
- **Font:** `font-heading` class for all headings (uppercase, bold)
- **API Pattern:** Single POST endpoint per domain (`/api/appliances`) with `action` field to route operations. All server-side operations use `supabaseAdmin` (service role).
- **Auth Pattern:** No JWT/session cookies. PIN hashes in env vars (admin), bcrypt in DB (shop passwords), plain text codes (entry/manager — should migrate to bcrypt).
- **Image Handling:** Camera capture → canvas compression (max 800px width, JPEG 0.7 quality) → base64 → Gemini analysis or Cloudinary upload
- **Error Handling:** ErrorFlash/SuccessFlash components for user feedback. Toast pattern in manager dashboard.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ADMIN_PIN_HASHES          # JSON array: [{"hash":"$2a$10$...","name":"Admin"}]
NEXT_PUBLIC_FB_PIXEL_ID
NEXT_PUBLIC_WHATSAPP_NUMBER
```

## Known Issues / Tech Debt (From Full Audit — April 2026)

### SECURITY CRITICAL
1. **shop_items RLS is WIDE OPEN for writes** — anon key can INSERT/UPDATE/DELETE any item. Admin page uses anon client directly instead of API routes. MUST create server-side API routes and lock RLS to SELECT only.
2. **website_config RLS allows anon UPDATE** — anyone can change site settings. Same fix needed.
3. **Gemini endpoint accepts custom prompts from client** — remove `customPrompt`, define all prompts server-side.
4. **Plain text password column still exists** in shop_passwords table — drop it.
5. **No middleware.ts** — no server-side route protection.
6. **No CSP header** — XSS risk.

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
17. **No state transition validation** — API accepts any update, no business rule enforcement.
18. **No Gemini auto-fill on appliance intake** — workers manually select everything.
19. **No end states defined** — items sit in "delivered" forever.
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
