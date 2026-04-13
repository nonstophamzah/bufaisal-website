# Bu Faisal Platform — Full Technical Audit

**Date:** April 12, 2026
**Auditor:** Claude (Cowork)
**Scope:** Every file, every route, every table, every line. Security, SEO, architecture, performance, UX, agent-readiness.
**Goal:** Identify every gap between current state and world-class production level.

---

## VERDICT: WHERE YOU STAND

Your app works. It's live, people use it, and you built it fast. But "works" and "world-class" are very different things. This audit found **47 specific issues** across 7 categories. Some are critical (your database is open to anyone with the anon key). Some are strategic (no structured data means Google treats you like any random site). None of them are unfixable.

The honest truth: you're at about **55/100** for production quality. A weekend project that works is 30. A startup MVP is 50. You're just past MVP. World-class is 90+. The gap is mostly in security, architecture, and SEO — not features.

---

## 1. SECURITY — 14 Issues Found

### CRITICAL: Your Database is Wide Open for Writes

This is the single most dangerous issue in your entire app. Look at your RLS policies in `supabase-security-lockdown.sql`:

```sql
-- shop_items: anon can insert, update, delete
CREATE POLICY "anon_insert_shop_items" ON shop_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_shop_items" ON shop_items FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_shop_items" ON shop_items FOR DELETE TO anon USING (true);

-- website_config: anon can update
CREATE POLICY "anon_update_website_config" ON website_config FOR UPDATE TO anon USING (true);
```

**What this means:** Anyone who finds your Supabase anon key (it's in your client-side JavaScript, visible to anyone who opens browser DevTools) can INSERT fake products, UPDATE prices to 0, DELETE all your items, and CHANGE your website config (hero text, WhatsApp number, about page). They don't need to hack anything — they just need the key that's already public in your frontend code.

**Why it exists:** Your admin page and team upload page use the anon Supabase client directly from the browser, not through your API routes. The appliance tracker correctly routes everything through `/api/appliances` using `supabaseAdmin` (service_role), but the marketplace side skips this.

**Fix:** Move ALL write operations for `shop_items` and `website_config` through server-side API routes using `supabaseAdmin`. Then lock down RLS to anon SELECT only. This is your #1 priority.

### HIGH: Gemini Endpoint Accepts Arbitrary Prompts

```typescript
// api/gemini/route.ts
const { imageBase64, mimeType, prompt: customPrompt } = await request.json();
// ...
parts: [{ text: customPrompt || defaultPrompt }, ...]
```

The client sends a `prompt` field and the server passes it directly to Gemini. This means anyone can use your Gemini API key as a free AI proxy — send any image with any prompt and get responses billed to your account. The origin check helps but can be spoofed.

**Fix:** Remove `customPrompt` from client requests. Define all prompts server-side. Use an `action` field (like your appliance API) to select between predefined prompts: `barcode_scan`, `item_analysis`, `appliance_analysis`.

### HIGH: No Content Security Policy (CSP)

Your `next.config.mjs` has good security headers (HSTS, X-Frame-Options, nosniff) but is missing CSP. Without it, if someone injects a script (through a product description or any user-generated content), it will execute freely.

**Fix:** Add CSP header:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; img-src 'self' https://res.cloudinary.com https://images.unsplash.com https://*.supabase.co data:; connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com;
```

### HIGH: No Middleware — No Request-Level Auth

You have no `middleware.ts` file. This means there's no server-side check on `/admin`, `/appliances/manager`, or `/team` routes. Auth is handled entirely in the client — `sessionStorage` checks in `useEffect`. Anyone can load the admin page HTML/JS, and the only thing stopping them is that the Supabase queries won't return data (except they WILL for shop_items because of your open RLS policies).

**Fix:** Add `middleware.ts` that validates auth tokens/cookies on protected routes. At minimum, use Next.js middleware to redirect unauthenticated requests.

### MEDIUM: Session Auth is Browser Memory Only

```typescript
// appliances: sessionStorage
sessionStorage.setItem('app_worker', JSON.stringify({ name, role }));
sessionStorage.setItem('app_code', 'ok');

// admin: sessionStorage
sessionStorage.setItem('admin_session', JSON.stringify({ name, ts: Date.now() }));
```

Session data lives only in the browser tab. No httpOnly cookies, no JWT, no server-side session. A user can modify `sessionStorage` in DevTools to impersonate any worker or admin.

**Fix (short-term):** Sign session data server-side with a secret and store as httpOnly cookie. Validate on each API request.
**Fix (long-term):** Implement proper auth (Supabase Auth, or at minimum JWT-based sessions).

### MEDIUM: Entry and Manager Codes are Plain Text

```typescript
// api/appliances/route.ts
const { data } = await supabaseAdmin.from('appliance_config').select('value').eq('key', 'entry_code');
return NextResponse.json({ match: data?.value === body.code });
```

Codes are stored and compared as plain text. The entry code is `123abc` by default.

**Fix:** Hash with bcrypt like you did for shop passwords.

### MEDIUM: Plain Text Password Column Still Exists

Your migration adds `password_hash` but the comment says "After verifying hashes work, drop the plain 'password' column." It was never dropped. Old passwords may still be readable.

**Fix:** `ALTER TABLE shop_passwords DROP COLUMN password;`

### MEDIUM: Rate Limiter Resets on Deploy

Your rate limiter is in-memory. Every Vercel deploy resets all counters.

**Fix:** Use Upstash Redis (free tier, built for Vercel). Drop-in replacement for your in-memory store.

### MEDIUM: No CSRF Protection

No CSRF tokens on any form. POST endpoints validate origin (good) but origin headers can be omitted in some browsers/scenarios.

### LOW: Cloudinary Unsigned Uploads

The team portal uploads directly to Cloudinary with an unsigned preset. Anyone with the cloud name and preset can upload files to your Cloudinary account.

### LOW: Click Tracking is Gameable

```typescript
await supabase.rpc('increment_whatsapp_clicks', { item_id: itemId });
```

No deduplication. A script could inflate click counts on any item.

### LOW: No Input Sanitization on User Content

Item descriptions, condition notes, and repair notes are stored and displayed without sanitization. Potential XSS vector.

### LOW: Origin Verification is Bypassable

```typescript
if (origin && ALLOWED_ORIGINS.includes(origin)) return true;
if (referer && ALLOWED_ORIGINS.some((o) => referer.startsWith(o))) return true;
return false;
```

If neither header is present (some API clients), the check fails silently. But more importantly, the `referer` check uses `startsWith` which could be tricked with domains like `bufaisal.ae.evil.com`.

### INFO: .env.local in Repo

Your `.env.local` is in the repo directory. Verify it's in `.gitignore` and was never committed.

---

## 2. SEO — 11 Issues Found

### CRITICAL: No JSON-LD Structured Data

Your product pages have good meta tags but ZERO structured data. Google doesn't know these are products. No price, no availability, no condition, no brand in structured format. This means you're invisible for rich search results.

**Fix:** Add to every `item/[id]/page.tsx`:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Samsung Refrigerator",
  "description": "...",
  "image": "...",
  "brand": { "@type": "Brand", "name": "Samsung" },
  "offers": {
    "@type": "Offer",
    "price": "500",
    "priceCurrency": "AED",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/UsedCondition"
  }
}
</script>
```

### CRITICAL: No LocalBusiness Schema

You're a physical business with 5 shops. Google should know this. You need Organization + LocalBusiness schema on your homepage.

### HIGH: Sitemap Includes Private Pages

Your sitemap includes `/team` (priority 0.3) but this is a password-protected upload portal. It shouldn't be crawled.

Missing from sitemap: `/about`, `/categories` — these ARE public and should be indexed.

### HIGH: No Canonical Tags

No explicit canonical URLs set. Next.js auto-generates some, but for an ecommerce site with filters and sort parameters, you need explicit canonicals to avoid duplicate content.

### MEDIUM: No Breadcrumb Schema

Product pages should have breadcrumb structured data: Home > Category > Product. Google displays these in search results and they significantly improve CTR.

### MEDIUM: Meta Descriptions Not Length-Controlled

Your Gemini-generated SEO descriptions have no length constraint. Google truncates at ~155 characters. Descriptions could be too long or too short.

### MEDIUM: No og:image Fallback

If a product has no thumbnail, the OpenGraph image is empty. Social shares will have no preview image.

### MEDIUM: Missing Alt Text

Multiple `<img>` tags use `alt=""` or no meaningful alt text. Every product image should have: `alt="[Brand] [Product Type] - Used [Condition] - Buy in Ajman"`

### LOW: No hreflang Tags

You have EN/AR language support but no `hreflang` tags telling Google about the language alternatives. This hurts Arabic search visibility.

### LOW: No FAQ Schema

Your about page has FAQ-style content that could use FAQ schema for rich results.

### LOW: robots.txt Could Be More Specific

Currently blocks `/admin`, `/appliances`, `/api`. Should also block `/login`, `/team`, and any query parameter variations.

---

## 3. ARCHITECTURE — 9 Issues Found

### CRITICAL: Admin Uses Anon Client for Database Writes

The admin dashboard (`admin/page.tsx`) imports `supabase` (anon client) and does direct CRUD:

```typescript
import { supabase } from '@/lib/supabase';
// Then directly: supabase.from('shop_items').update(...)
```

This bypasses your API routes and server-side validation entirely. The appliance tracker correctly uses API routes — the marketplace side needs the same treatment.

**Fix:** Create `/api/admin/items/route.ts` and `/api/admin/config/route.ts` that use `supabaseAdmin`. Move all admin writes through these API routes. Then lock down the anon RLS to SELECT only.

### HIGH: 1200-Line Admin Page

`admin/page.tsx` is a single component with 1200+ lines containing: tab navigation, pending items list, published items list, sold items list, hidden items list, settings form, team management, analytics charts, inline edit panels, bulk actions, and modal dialogs.

This is unmaintainable. Any change risks breaking something else. Claude Code will struggle with context windows on this file.

**Fix:** Extract into: `AdminLayout.tsx`, `PendingTab.tsx`, `PublishedTab.tsx`, `SettingsTab.tsx`, `TeamTab.tsx`, `AnalyticsTab.tsx`, `EditItemModal.tsx`, `ItemCard.tsx` (shared).

### HIGH: No Error Boundaries

No React error boundaries anywhere. If any component throws, the entire page crashes with a white screen. Users see nothing.

**Fix:** Add error boundaries at the layout level and around each major section.

### HIGH: No loading.tsx or not-found.tsx

No custom loading states for server components. No custom 404 page. Users see default Next.js loading/error states.

### MEDIUM: Inconsistent API Pattern

Appliance tracker: All operations through `/api/appliances` with `action` field (good).
Marketplace: Direct Supabase from client (bad).
Admin: Direct Supabase from client (bad).

**Fix:** Everything should go through API routes. One pattern, consistently applied.

### MEDIUM: No TypeScript Strict Mode

`tsconfig.json` doesn't have `strict: true`. This means TypeScript catches fewer bugs.

### MEDIUM: No Database Migration Tool

12 SQL files dumped in root with names like `supabase-fix-manager.sql` and `supabase-hotfix-rls.sql`. No migration runner, no version tracking, no rollback capability.

**Fix:** Adopt Supabase CLI migrations or a simple numbered migration system.

### LOW: Duplicate Component Code

`ConditionBadge` logic duplicated in `item-detail-client.tsx` and `admin/page.tsx`. WhatsApp tracking duplicated in multiple places.

### LOW: Heavy useState Without Reducer

Admin and manager pages have 15+ individual useState calls. Should use useReducer for complex state.

---

## 4. PERFORMANCE — 7 Issues Found

### HIGH: N+1 Queries on Categories Page

```typescript
// categories/page.tsx
for (const cat of CATEGORIES) { // 8 categories = 8 queries
  const { count } = await supabase.from('shop_items').select('*', { count: 'exact', head: true })...
}
```

8 sequential database queries where 1 GROUP BY would work.

**Fix:** Single RPC or raw SQL: `SELECT category, COUNT(*) FROM shop_items WHERE is_published = true GROUP BY category`

### HIGH: Client-Side Filtering After Fetching 200 Items

```typescript
// page.tsx (marketplace)
const { data } = await supabase.from('shop_items').select('*')...limit(200);
// Then filters in browser
const filtered = items.filter(...)
```

Always loads 200 items, then filters. On mobile with slow connections, this is 200 items × image URLs worth of JSON before the user sees anything.

**Fix:** Push filters to Supabase query. When user selects "Kitchen" category, the query should filter server-side.

### MEDIUM: Sequential Gemini Calls

Team upload analyzes item photo and barcode photo sequentially. Should use `Promise.all()` to run in parallel. Saves 2-4 seconds per upload.

### MEDIUM: Admin Loads All Items on Tab Switch

Every tab in admin fetches all items without pagination. With hundreds of items, this will slow down significantly.

### MEDIUM: No Image Lazy Loading Strategy

Marketplace grid uses Next.js Image with lazy loading, but the initial viewport loads many images simultaneously. Should prioritize above-the-fold images with `priority` prop and lazy-load the rest.

### LOW: Facebook Pixel Inline Script

FB Pixel is loaded via `dangerouslySetInnerHTML`. Should use Next.js Script with `strategy="lazyOnload"` to avoid blocking initial render.

### LOW: No Caching Headers on API Routes

API routes return data without cache headers. Frequently-accessed data (categories, published items) could use `Cache-Control` headers.

---

## 5. UX & CONVERSION — 6 Issues Found

### HIGH: No WhatsApp Pre-fill With Item Details

When someone taps WhatsApp on a product, the message should include the item name, price, and a link back to the product page. Verify this is working consistently across all entry points.

### MEDIUM: No Search on Marketplace

The marketplace has category filters but no text search. Users can't search for "Samsung refrigerator" — they have to scroll through categories.

**Fix:** Add a search bar with Supabase full-text search or `ilike` matching on item_name and brand.

### MEDIUM: No Price Display Consistency

Some items show "AED 500", some show "Contact for price", some show nothing. Price display should be consistent and always visible.

### MEDIUM: No "Similar Items" on Product Pages

Product detail pages show one item and a WhatsApp button. No related items, no "you might also like." This is a missed conversion opportunity.

### LOW: Language Toggle Not Persistent

EN/AR toggle resets on page reload. Should persist in localStorage or URL parameter.

### LOW: No Accessibility

No ARIA labels on interactive elements, no keyboard navigation support, no focus management on modals. Won't pass WCAG 2.1 AA.

---

## 6. APPLIANCE TRACKER (AGENT-READINESS) — 8 Issues Found

*Repeated from previous audit with additional technical depth.*

### CRITICAL: No State Transition Validation

The API accepts any update to any field. No server-side enforcement of valid transitions. This is the #1 blocker for an agent — you can't trust an agent to follow rules that aren't enforced.

### CRITICAL: Gemini Not Used for Auto-Fill on Intake

The team portal uses Gemini for full item analysis (product type, brand, condition, category, SEO). The appliance intake only uses it for barcode scanning. Workers still manually select everything. This is the biggest friction point and the core of your agent vision.

### HIGH: State Machine Has Phantom States

Your migration SQL defines states that don't exist in the app code:
- SQL: `ready_to_sell`, `sold`, `scrapped` (in location_status comments)
- App code: only uses `at_shop`, `sent_to_jurf`, `at_jurf`, `delivered`

The schema is ahead of the code. Either implement these states or remove them from the schema.

### HIGH: No End States

What happens after `delivered`? The item sits in the database forever with `location_status: delivered`. No path to marketplace, no path to closed/archived.

### HIGH: No Duplicate Barcode Detection

Workers can log the same barcode multiple times. No check on insert.

### MEDIUM: No Notification System

No way to push updates to workers/managers. Everyone has to check dashboards manually.

### MEDIUM: Audit Log Incomplete

`appliance_audit_log` exists but only some actions write to it. No consistent logging of all state changes.

### LOW: Old `status` Column Still Active

Both `status` (old, user-facing: "Working"/"Not Working") and `condition` (new, system: "working"/"not_working") columns exist. Some code reads one, some reads the other. Confusing and error-prone.

---

## 7. INFRASTRUCTURE & OPS — 2 Issues Found

### MEDIUM: No Error Monitoring

No Sentry, LogRocket, or any error tracking. When something breaks in production, you won't know unless a user tells you.

### MEDIUM: No Analytics Beyond FB Pixel

FB Pixel tracks page views and WhatsApp clicks. No Google Analytics, no product view tracking, no conversion funnel analysis.

---

## PRIORITY ACTION PLAN

### P0 — Do This Week (Security Critical)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | Lock down shop_items RLS to anon SELECT only | 2 hours | Prevents data destruction |
| 2 | Create API routes for admin CRUD operations | 4 hours | Enables RLS lockdown |
| 3 | Lock down website_config RLS to anon SELECT only | 30 min | Prevents config tampering |
| 4 | Remove custom prompt from Gemini endpoint | 30 min | Stops API key abuse |
| 5 | Drop plain text password column | 5 min | Removes password exposure |

### P1 — Do This Month (Quality + SEO)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 6 | Add JSON-LD Product schema to item pages | 2 hours | Major SEO boost |
| 7 | Add LocalBusiness schema to homepage | 1 hour | Local search visibility |
| 8 | Add CSP header to next.config | 1 hour | XSS prevention |
| 9 | Add middleware.ts for route protection | 3 hours | Server-side auth |
| 10 | Add Gemini auto-fill to appliance intake | 4 hours | Agent-readiness + UX |
| 11 | Add state transition validation to API | 4 hours | Agent-readiness |
| 12 | Fix N+1 categories query | 1 hour | Performance |
| 13 | Add error boundaries | 2 hours | Reliability |
| 14 | Fix sitemap (remove /team, add /about, /categories) | 30 min | SEO |

### P2 — Do Next Month (Architecture + Scale)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 15 | Split admin page into components | 6 hours | Maintainability |
| 16 | Split manager page into components | 4 hours | Maintainability |
| 17 | Server-side filtering on marketplace | 3 hours | Performance |
| 18 | Add text search to marketplace | 3 hours | UX + conversion |
| 19 | Add duplicate barcode detection | 1 hour | Data integrity |
| 20 | Replace in-memory rate limiter with Upstash | 2 hours | Security |
| 21 | Add Sentry error monitoring | 1 hour | Ops |
| 22 | Add breadcrumb schema | 1 hour | SEO |
| 23 | Define and implement end states | 4 hours | Agent-readiness |

### P3 — Do When Ready (Polish + Scale)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 24 | Hash entry/manager codes | 1 hour | Security |
| 25 | httpOnly cookie sessions | 4 hours | Security |
| 26 | Database migration tool | 3 hours | Ops |
| 27 | Similar items on product pages | 3 hours | Conversion |
| 28 | Notification system for appliance tracker | 6 hours | Agent-readiness |
| 29 | hreflang tags for AR/EN | 1 hour | SEO |
| 30 | Accessibility audit + fixes | 8 hours | Compliance |

---

## WHAT "WORLD CLASS" ACTUALLY LOOKS LIKE

For your context — a UAE second-hand goods marketplace with internal ops — "world class" means:

**Security:** No open write policies. All mutations through authenticated API routes. Rate limiting that survives deploys. Session management with httpOnly cookies. CSP headers. Input sanitization.

**SEO:** Product structured data on every item page. LocalBusiness schema. Proper canonical tags. Breadcrumbs. Arabic language support with hreflang. Fast Core Web Vitals. Above 90 on Lighthouse.

**Architecture:** Components under 200 lines. Consistent API pattern (everything through routes). Error boundaries everywhere. TypeScript strict mode. At least critical-path test coverage. Database migrations managed properly.

**Performance:** Server-side filtering. Proper pagination. Parallel API calls. Optimized images. Cache headers. Sub-3-second page loads on mobile.

**Agent-Readiness:** Every state transition enforced at API level. Full audit logging. Gemini auto-fill on all intake flows. Defined end states. Notification hooks. Duplicate detection.

You're not far from this. The foundation is solid. The gaps are specific and fixable. The question is whether you go in priority order or chase the exciting stuff first.

I'd recommend starting with the P0 security fixes because your database being writable by anyone is genuinely dangerous. After that, P1 items 10 and 11 (Gemini auto-fill and state validation) because those directly advance your agent vision while also improving the app.
