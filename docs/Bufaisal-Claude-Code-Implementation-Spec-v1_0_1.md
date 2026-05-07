# Bufaisal Intake System — Claude Code Implementation Spec

**Version:** 1.0.1
**Date:** May 7, 2026
**Owner:** Hamzah Khan
**Status:** Ready for execution
**Repo:** `nonstophamzah/bufaisal-website`
**Vercel project:** `bufaisal-website`
**Supabase project:** `otjizosjzbgbebxjleyf`

**Companion docs (READ THESE FIRST before starting):**
1. `Bufaisal-Website-Architecture-v1.0.docx` — strategic decisions, the why
2. `Bufaisal-SEO-Agent-v1.0.docx` — content rules, voice, structure
3. `Bufaisal-Decisions-Log-v1.0.docx` + `v1.1 Addendum` — chronological lock log
4. `Bufaisal-Listing-Generator-Prompt-v1_0-FINAL.md` — the AI prompt

If anything in this implementation spec conflicts with those documents, **the documents win.** Stop and ask Hamzah.

---

## How to use this document

This is broken into **9 phases.** Execute them in order. Do not skip ahead. Each phase has:

- **Goal:** what this phase achieves
- **Audit first:** what to read/check before writing code
- **Build:** what to actually implement
- **Test:** how to verify it works
- **Don't break:** what NOT to touch (sacred routes, existing flows)

Hamzah will test each phase on real phones before approving the next. **Do not start a phase until the previous one is approved.**

---

## CRITICAL — Sacred Routes (Never Touch)

Before any work, understand: these routes are **production-critical** and used daily by workers and admins. They must NEVER be modified, broken, or refactored unless the user requested it explicitly.

- `/team` — worker upload portal (existing)
- `/admin` — admin approval portal (existing)
- `/appliance-tracker` — internal appliance ops dashboard
- `/api/appliances` — internal API for the tracker

Some of these will be UPDATED in this spec, but only with explicit changes documented below. If you find yourself rewriting a sacred route file end-to-end, stop and ask.

The website upload flow lives at `/team` (or wherever the current website-upload entry point is). The pending review flow lives at `/admin`. **These names stay.** Routes don't get renamed.

---

## PHASE 0 — Audit & Discovery (Required Before Any Code)

**Goal:** Understand the current state before changing anything.

**Do this:**

1. Read all 4 companion docs listed at top.
2. Run a code audit and report back to Hamzah BEFORE writing any code:
   - Where does the current worker upload flow live? File paths.
   - Where is the current AI generation triggered? Pre-submit, post-submit, both?
   - What model is currently used? (Per memory: should be `claude-haiku-4-5-20251001`. Confirm.)
   - What's the current `items` table schema? List all columns.
   - Where are photos uploaded today? Cloudinary, Supabase Storage, both?
   - Is browser-side photo compression in place? Almost certainly no.
   - Are uploads sequential or parallel today?
   - Do photos upload on capture or on submit?
   - What's the current state machine? (`status` enum values?)
   - Where are the AI prompts stored? Hardcoded? Separate files?

3. Output a written summary of findings to Hamzah. Wait for approval before Phase 1.

**Why this matters:** Several decisions in this spec assume the current code looks a certain way. If reality differs, the implementation order may need to change. An audit prevents wasted work.

---

## PHASE 1 — Database Schema Migration

**Goal:** Add the new state machine, the schema separation columns, and supporting tables. Without this, nothing else works.

### Audit first

- Look at the current `items` table (or `shop_items`, depending on naming).
- Identify all existing columns. Save them — we don't drop any.
- Check for existing foreign keys or indexes that might affect the migration.

### Build

#### 1A. Extend the `status` enum

Current: likely `draft`, `published`, `sold`, `archived`.

Add: `processing`, `pending`.

New values: `processing`, `pending`, `published`, `sold`, `archived`.

Migration approach: keep `draft` as a deprecated alias for backward compatibility, but new items must use `processing` or `pending`.

#### 1B. Add schema separation columns

Per locked decision: worker input, AI output, admin overrides, and published values live in separate columns. AI cannot overwrite worker. Admin overrides cannot overwrite AI output. Published values are computed at approval time.

Add these columns to the items table (use JSONB where the data is structured):

**Worker-provided columns (set at submit):**
- `worker_condition_type` (text: 'Used' or 'New')
- `worker_condition_grade` (text: 'Excellent' / 'Good' / 'Fair' / null)
- `worker_negotiable` (boolean)
- `worker_price_aed` (integer)
- `worker_note` (text, nullable)
- `worker_shop_id` (text)
- `worker_photo_brand_url` (text)
- `worker_photo_2_url` (text)
- `worker_photo_3_url` (text)
- `worker_photo_barcode_url` (text)
- `worker_submitted_at` (timestamptz)
- `worker_id` (text, references the logged-in worker)

**AI-generated columns (set when background processor completes):**
- `ai_barcode_extracted` (text, nullable)
- `ai_label_item_type` (text, nullable)
- `ai_brand` (text)
- `ai_item_name` (text)
- `ai_product_type` (text)
- `ai_category` (text)
- `ai_seo_title` (text)
- `ai_h1_title` (text)
- `ai_meta_description` (text)
- `ai_slug` (text)
- `ai_description` (text)
- `ai_spec_table` (jsonb)
- `ai_faqs` (jsonb)
- `ai_image_alt_texts` (jsonb)
- `ai_geographic_anchor` (text)
- `ai_trust_signals` (jsonb)
- `ai_internal_link_targets` (jsonb)
- `ai_product_schema` (jsonb)
- `ai_faq_schema` (jsonb)
- `ai_confidence_score` (float, 0.0–1.0)
- `ai_flags` (jsonb, array of strings)
- `ai_generated_at` (timestamptz)
- `ai_prompt_version` (text)
- `ai_model_used` (text)

**Admin override columns (set only if admin edits during approval):**
- `admin_brand` (text, nullable)
- `admin_item_name` (text, nullable)
- `admin_product_type` (text, nullable)
- `admin_category` (text, nullable)
- `admin_seo_title` (text, nullable)
- `admin_meta_description` (text, nullable)
- `admin_description` (text, nullable)
- `admin_slug` (text, nullable)
- `admin_spec_table` (jsonb, nullable)
- `admin_faqs` (jsonb, nullable)
- `admin_trust_signals` (jsonb, nullable)
- `admin_image_alt_texts` (jsonb, nullable)
- `admin_geographic_anchor` (text, nullable)
- `admin_internal_link_targets` (jsonb, nullable)
- `admin_condition_grade` (text, nullable) — admin can override worker's grade if disagreement flagged
- `admin_price_aed` (integer, nullable) — admin can override the worker-set price
- `admin_negotiable` (boolean, nullable) — admin can override the negotiable flag
- `admin_approved_at` (timestamptz, nullable)
- `admin_approved_by` (text, nullable)

**Published columns (set at approval, take admin override if present, else AI):**
- `published_brand` (text)
- `published_item_name` (text)
- `published_product_type` (text)
- `published_category` (text)
- `published_seo_title` (text)
- `published_meta_description` (text)
- `published_description` (text)
- `published_spec_table` (jsonb)
- `published_faqs` (jsonb)
- `published_trust_signals` (jsonb)
- `published_slug` (text)
- `published_at` (timestamptz)

#### 1C. Create `audit_log` table (pulled forward from Phase 2)

Records every meaningful state change. Cheap insurance for debugging and forensics.

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES items(id),
  action text NOT NULL,         -- e.g. 'submitted', 'ai_completed', 'admin_approved', 'admin_edited'
  actor_type text NOT NULL,     -- 'worker' / 'ai' / 'admin' / 'system'
  actor_id text,                -- worker_id or admin email or 'ai-v1.0'
  before_state jsonb,           -- nullable
  after_state jsonb,            -- nullable
  metadata jsonb,               -- nullable: error messages, flags, etc.
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_log_item ON audit_log(item_id, created_at DESC);
```

#### 1D. RLS policies

Per existing pattern (anon: SELECT only on published items; service role: ALL):

- Anon role can SELECT items WHERE status = 'published'
- Anon role can SELECT audit_log: NEVER (it's internal)
- Authenticated/service role: full access via existing patterns

### Test

- Run the migration locally and on a Supabase dev branch first.
- Verify all existing items still load.
- Verify existing `/admin` and `/team` flows still work (no breaks).
- Verify RLS: anon can read published items, cannot read processing/pending items.

### Don't break

- Existing items with `status='draft'` or `status='published'` keep working.
- Existing appliance-tracker tables (`appliance_items`, `appliance_workers`, `appliance_config`) untouched.
- Don't drop any existing column. Add only.

### Approval gate

Hamzah verifies in Supabase SQL Editor that:
- New columns exist
- New status values work
- audit_log table exists
- Existing data is intact

---

## PHASE 2 — Photo Upload Optimization

**Goal:** Make photo uploads fast and resilient. Photos compress in browser, upload on capture (background), and persist on Cloudinary forever.

### Audit first

- Find the current photo upload code in the worker upload flow.
- Confirm Cloudinary config: cloud name `df8y0k626`, unsigned preset `bufaisal_unsigned`.
- Check if `browser-image-compression` (or similar) is already installed.

### Build

#### 2A. Install browser image compression

```bash
npm install browser-image-compression
```

#### 2B. Compress photos client-side BEFORE upload

When a worker captures or selects a photo, run it through compression:

```typescript
import imageCompression from 'browser-image-compression';

const compressed = await imageCompression(file, {
  maxSizeMB: 0.4,             // ~400KB target
  maxWidthOrHeight: 1600,     // max dimension
  useWebWorker: true,
  fileType: 'image/jpeg',     // standardize to JPEG
});
```

#### 2C. Upload on capture, not on submit

When a photo is captured (or selected), immediately upload it to Cloudinary in the background. Track upload state per slot.

```typescript
// Pseudocode pattern:
async function onPhotoCapture(slot: 'brand' | 'photo_2' | 'photo_3' | 'barcode', file: File) {
  setSlotState(slot, { status: 'compressing' });
  const compressed = await imageCompression(file, options);

  setSlotState(slot, { status: 'uploading' });
  const url = await uploadToCloudinary(compressed);

  setSlotState(slot, { status: 'uploaded', url });
}
```

Submit is enabled only when all 4 photo slots have status `uploaded` AND all required form fields are filled.

#### 2D. Parallel upload (free with capture-time uploads)

Each photo upload is independent and parallel by design (each fires when its photo is captured). No code change needed beyond 2C — just confirm no sequential `await` chains.

#### 2E. Cloudinary persistence rule (CRITICAL)

**Photos uploaded to Cloudinary are NEVER auto-deleted.**

- Do NOT add cleanup logic that deletes photos when items are rejected, archived, or otherwise removed.
- Do NOT tie photo lifecycle to item record lifecycle.
- The only deletion path is an explicit, manual admin action (build a separate "delete this orphan photo" tool later if needed; not in v1).

Add a code-level comment in any function that handles photo URL changes:

```typescript
// CRITICAL: Cloudinary photos are permanent. Never auto-delete.
// See Bufaisal-Decisions-Log-v1.1-Addendum decision 2026-05-07 #6.
```

#### 2F. Browser local storage for in-progress uploads

If the worker's phone crashes or they navigate away mid-upload, restore their progress on return:

- Save photo URLs and form state to localStorage as the worker works.
- On screen mount, check localStorage for in-progress draft. Offer "Resume" if found.
- Clear localStorage on successful submit.

Key shape:
```typescript
localStorage['bufaisal-upload-draft'] = JSON.stringify({
  worker_id: 'imran',
  photos: { brand: 'https://...', photo_2: '', photo_3: '', barcode: '' },
  condition_type: null,
  condition_grade: null,
  // ... etc
  saved_at: new Date().toISOString(),
});
```

### Test

- Take 4 photos on a real phone. Verify each compresses to ~200–400KB and uploads in 2–5 seconds.
- Take photo 1, then photo 2, etc. Verify uploads run in parallel (look at network tab).
- Tap submit. Verify it returns in <2 seconds because photos are already uploaded.
- Force-quit the browser mid-upload, reopen the page. Verify draft is restored.
- Reject an item from admin. Verify the Cloudinary photos are still accessible at their URLs (not auto-deleted).

### Don't break

- The appliance tracker's photo upload flow at `/appliance-tracker` — that has its own photo handling and is NOT in scope here. Don't touch it.
- Existing items with old photo URLs continue to work.

---

## PHASE 3 — Worker Upload Screen Rebuild

**Goal:** Replace the current upload screen with the locked design. No AI button. Pill-based input. Forced completeness.

### Audit first

- Find the current worker upload screen (likely in `/team` or `/app/team` or similar).
- Identify the current AI scan/generation button and any code paths that trigger AI from the worker side.

### Build

#### 3A. New upload screen layout

Per locked spec. Order top-to-bottom:

1. **Header** — "Add Item" title, optional small "Items uploaded today: N" counter.
2. **Item Photos zone** — labeled "ITEM PHOTOS (3 required)". Three photo slots.
   - Slot 1 labeled "Brand" with helper text below: *"Shoot the brand plate or logo. For furniture without a brand, take a clean angle of the item."*
   - Slot 2 labeled "Photo 2"
   - Slot 3 labeled "Photo 3"
3. **Barcode Photo zone** — labeled "BARCODE LABEL PHOTO (required)" in a visually distinct zone (border, different background, etc.). One slot.
4. **Condition pills** — "Used" / "New" buttons.
5. **Sub-condition pills** — "Excellent" / "Good" / "Fair" — only rendered when "Used" is selected.
6. **Negotiable pills** — "Yes" / "No".
7. **Price input** — number-pad keyboard, AED label, integer only.
8. **Note field** — always visible, multi-line text input, labeled "Note (optional)".
9. **Submit button** — disabled (greyed) until all required fields are complete.

#### 3B. No AI button anywhere on the worker screen

Search the codebase for the current AI scan/generate button. Remove it from the worker upload flow entirely. Move the same button (or its replacement) to the admin pending screen — see Phase 7.

#### 3C. Required field validation

Submit is enabled only when:
- All 4 photo slots show `uploaded` status with valid Cloudinary URLs
- `condition_type` is selected (Used or New)
- If condition_type is "Used": `condition_grade` is selected
- `negotiable` is selected (Yes or No)
- `price_aed` is a positive integer

Note field is always optional. Never required.

#### 3D. Submit action

When submit is tapped:

1. Disable the button immediately.
2. Show progress bar 0% → 100% over ~1.5 seconds (smooth fill animation).
3. POST to `/api/items/submit` with the worker_* fields and 4 photo URLs.
4. Server creates a row in the items table with `status='processing'`.
5. Server triggers the async AI processor (Phase 4).
6. Server returns the new item ID.
7. On success, show green tick + "Item uploaded ✓" for ~1 second.
8. Auto-redirect to a fresh empty upload screen.
9. Increment "Items uploaded today" counter (stored in localStorage, daily reset).
10. Clear draft from localStorage.

If submit fails (network error, server 500), show an error and let the worker retry. Photos are already on Cloudinary, so retry doesn't lose work.

#### 3E. Optional UX polish

- Each photo slot shows a thumbnail when filled, with an "X" to retake.
- Pill buttons change color when selected (yellow `#F9D923` for active per brand colors).
- Submit button uses Bufaisal yellow when enabled, grey when disabled.

### Test

- On a real phone, complete a full intake in under 60 seconds.
- Verify submit cannot be tapped while any required field is empty.
- Verify the progress bar feels smooth, not janky.
- Verify the green tick appears and screen auto-redirects.
- Verify the daily counter increments.
- Force a submit failure (turn off wifi mid-submit). Verify retry works without re-uploading photos.

### Don't break

- The appliance tracker `/appliance-tracker` upload flow. Not the same screen, not the same code path.
- Existing items in the database — the new screen creates new records, doesn't modify old ones.

---

## PHASE 4 — Background AI Processor

**Goal:** When an item is submitted with `status='processing'`, run the AI listing generator in the background, then move the item to `status='pending'`.

### Audit first

- Find the current AI generation code. Likely in `/api/...` somewhere.
- Identify how the Anthropic SDK is currently called.
- Confirm `ANTHROPIC_API_KEY` exists in Vercel env vars.
- Confirm or add these additional env vars in Vercel before Phase 4 ships:
  - `NEXT_PUBLIC_BASE_URL` — full URL of the deployed site (e.g., `https://bufaisal.ae`). Used by the submit endpoint to call the generation endpoint internally.
  - `INTERNAL_API_SECRET` — random secret string used to authorize internal-only API calls (so `/api/items/[id]/generate-listing` rejects unauthenticated calls from the public internet). Generate a secure random string.

### Build

#### 4A. Background trigger — IMPORTANT, read carefully

Vercel serverless functions terminate when the response is sent. A naive "fire and forget" call (calling the generation endpoint without `await`) will be killed when the submit endpoint returns its response. The AI generation will silently fail. This is a known Vercel limitation.

There are three viable approaches. Pick ONE based on Vercel plan and reliability needs:

**Option A — `waitUntil()` from `@vercel/functions` (recommended for v1, works on Hobby tier)**

`waitUntil()` lets a function return its response to the user immediately while continuing to run background work. Free, available on Hobby tier, no extra infrastructure.

```typescript
import { waitUntil } from '@vercel/functions';

export async function POST(request: Request) {
  // ... validate input, create item with status='processing' ...
  const newItem = await createItemInDb(workerData);

  // Kick off AI generation in the background; this continues running after the response is sent
  waitUntil(
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/items/${newItem.id}/generate-listing`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}` },
    }).catch(err => console.error('AI trigger failed:', err))
  );

  // Return immediately to the worker
  return Response.json({ success: true, item_id: newItem.id });
}
```

The generation endpoint itself runs as a separate function with its own ~5-10 minute timeout window (Hobby tier max function duration). This is enough time for AI processing.

**Option B — Vercel cron job polling (more resilient, slightly slower)**

A Vercel cron runs every minute, looks for items with `status='processing'` older than 30 seconds, and processes them. Set up in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/process-pending-ai", "schedule": "* * * * *" }
  ]
}
```

The cron handler picks up to 5 items per run, processes them, updates status to `pending`. Slower (up to 60 seconds added latency before AI kicks in) but bulletproof — even if the submit endpoint dies, the cron will still pick up the orphaned item.

**Option C — Supabase database trigger (most resilient, requires extra setup)**

Use a Supabase database webhook that fires when a row is inserted with `status='processing'`. Webhook calls the generation endpoint. Fully decoupled from the submit endpoint. Best for long-term but adds setup complexity.

**Recommended for v1: Option A (`waitUntil`).** Simple, free, works on Hobby. If reliability becomes an issue post-launch, layer Option B on top as a safety net (cron picks up anything stuck in `processing` for 10+ minutes — already in the spec).

**Critical:** The cleanup job mentioned in 4C below — flipping items stuck in `processing` for 10+ minutes — is REQUIRED regardless of which option above you pick. It catches AI calls that died silently.

#### 4B. The generation endpoint

`POST /api/items/[id]/generate-listing`

Logic:

1. Fetch the item by ID.
2. Verify status is `processing` (or admin manually re-triggering — see Phase 7 regenerate button).
3. Load the system prompt from `lib/prompts/listing-generator-v1.md` (the FINAL prompt file from this conversation).
4. Construct the user message with:
   - 4 photo URLs as image content blocks
   - Worker input fields as text
   - Shop metadata
5. Call the Anthropic API:
   - Model: current Claude Sonnet (e.g., `claude-sonnet-4-6` or whatever is current — confirm with Hamzah; the model is upgraded from Haiku per locked decision)
   - Max tokens: 4096 (the JSON output is ~2000–3000 tokens; leave headroom)
   - System: the loaded prompt
   - Messages: the user message constructed above
6. Parse the JSON response.
7. Validate JSON structure (required fields present, types correct).
8. If validation fails: retry up to 2 times (so 3 attempts total). On final failure, save best-effort with `ai_validation_failed` flag.
9. Map output to `ai_*` columns in the items table.
10. Compute `ai_confidence_score` from the response.
11. Update item: set all `ai_*` columns, set `ai_generated_at`, set `ai_prompt_version='1.0'`, set `ai_model_used` to the model string.
12. Update `status` from `processing` to `pending`.
13. Insert audit_log row: `action='ai_completed'`, `actor_type='ai'`, metadata includes flags and confidence.

#### 4C. Error handling per the prompt's failure rules

| Failure | Handling |
|---|---|
| API timeout | Retry 2x with exponential backoff. Final failure → status=`pending`, flag=`ai_api_timeout`. |
| Invalid JSON returned | Retry 2x. Final failure → status=`pending`, flag=`ai_json_invalid`. |
| Self-validation fails 3x | Best-effort save → status=`pending`, flag=`ai_validation_failed`. |
| Cloudinary photo URL 404 | Save to pending with flag `photo_missing`. |

Every failure path ends with the item in `status='pending'` with at least one flag. Items NEVER stay in `processing` longer than 10 minutes — add a cleanup job that flips stuck `processing` items to `pending` with flag `ai_stuck_in_processing` after 10 minutes.

#### 4D. Prompt file storage

Save the prompt as `lib/prompts/listing-generator-v1.md` in the repo. Load it at runtime:

```typescript
import fs from 'fs';
import path from 'path';

const PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/listing-generator-v1.md'),
  'utf-8'
);
```

Or if you prefer, embed it as a string export from `lib/prompts/listing-generator-v1.ts`. Either works. **Just don't hardcode it inside the API route.**

#### 4E. Anthropic SDK call

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Format the user message text to match the prompt's INPUTS section format.
// Do NOT just JSON.stringify the whole input object — the model parses readable
// structured text more accurately than raw JSON blobs.
const userMessageText = `
INPUT FOR THIS ITEM:

Worker Input:
- condition_type: ${worker_input.condition_type}
- condition_grade: ${worker_input.condition_grade ?? 'N/A (item is New)'}
- negotiable: ${worker_input.negotiable}
- price_aed: ${worker_input.price_aed}
- note: ${worker_input.note ?? '(none)'}
- shop_id: ${worker_input.shop_id}

Shop Metadata:
- shop_name: ${shop_metadata.shop_name}
- shop_location: ${shop_metadata.shop_location}

Item ID (for your reference): ${item_id}

The 4 photos for this item are attached to this message in this order:
1. Brand photo
2. Photo 2 (item view)
3. Photo 3 (item angle/detail)
4. Barcode label photo

Generate the listing per your system instructions. Return only the JSON object.
`.trim();

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',  // CONFIRM CURRENT MODEL with Hamzah before deploying
  max_tokens: 4096,
  system: PROMPT,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: photos.brand } },
        { type: 'image', source: { type: 'url', url: photos.photo_2 } },
        { type: 'image', source: { type: 'url', url: photos.photo_3 } },
        { type: 'image', source: { type: 'url', url: photos.barcode } },
        { type: 'text', text: userMessageText },
      ],
    },
  ],
});

// The model returns content as an array of blocks. The text is in the first text block.
const textBlock = response.content.find(b => b.type === 'text');
if (!textBlock || textBlock.type !== 'text') {
  throw new Error('No text block in response');
}
const aiOutput = JSON.parse(textBlock.text);
```

**Confirm the model string with Hamzah before deploying.** As of May 2026, the current Sonnet on the Anthropic API is `claude-sonnet-4-6`. Use the latest available — verify at https://docs.claude.com/en/docs/about-claude/models/overview before deploying.

**Note on URL image sources:** The `{ type: 'url' }` source format is used here because photos are already on Cloudinary. The Anthropic API supports this directly — no need to base64-encode. If photos ever fail to load (e.g., Cloudinary 404), the API returns an error you can catch and convert into a `photo_missing` flag.

### Test

- Submit a test item via the worker upload screen.
- Watch the database: status should flip from `processing` to `pending` within 1–3 minutes.
- Verify all `ai_*` columns are populated.
- Verify the audit_log has an entry.
- Submit an item with deliberately bad photos (blurry barcode, no brand visible). Verify flags are set correctly.
- Test with no internet to Cloudinary (block in dev). Verify `photo_missing` flag.

### Don't break

- The legacy AI flow (if any still runs from the worker side). After Phase 3 it should be gone, but verify.
- Existing items already in `pending` status keep working.

---

## PHASE 5 — Admin Pending Dashboard

**Goal:** Admin (Hamzah, Yousuf, Ahmed) opens `/admin`, sees a list of pending items with AI-pre-filled listings, and can approve, edit, or regenerate.

### Audit first

- Find the current admin screen.
- Identify how authentication works (Hamzah/Yousuf/Ahmed only).
- Identify the current edit drawer / approval flow.

### Build

#### 5A. Pending list view

A list/grid of all items where `status='pending'`. Each card shows:

- Thumbnail (the brand photo)
- AI-generated title (`ai_seo_title` or fallback)
- Confidence score (visual indicator: green dot ≥0.8, yellow 0.6–0.8, red <0.6)
- Flag badges (one badge per flag in `ai_flags`)
- "Quick approve" button (only enabled if confidence ≥ 0.8 AND no flags)
- "Review" button (always enabled, opens detail editor)

Sort: newest first by `worker_submitted_at`. Add filters:
- All / Needs Review (any flag) / Quick Approve eligible
- By shop
- By category

#### 5B. Item detail editor

When admin clicks "Review" on a card, open a detail view (modal or full page).

Layout:

**Left side — Photos**
- All 4 photos in a grid (Brand, Photo 2, Photo 3, Barcode)
- Click to enlarge
- Show extracted barcode below the barcode photo

**Center — Editable fields**
Each field shows the AI value as the default, but admin can edit. When admin edits, the value goes into `admin_*` not `ai_*`. AI value is preserved.

Editable fields:
- Brand
- Item Name
- Category (dropdown of 8 locked categories)
- Product Type (dropdown from PRODUCT_TYPE_VOCABULARY)
- SEO Title
- Meta Description
- Body Description
- Spec Table (key-value editor)
- FAQs (4 expandable rows, each with question + answer text fields)
- Trust Signals (multi-select from approved whitelist)
- Slug
- Condition Grade (only if `worker_condition_type='Used'`; admin can override worker per locked decision rule, with a warning that the worker's grade was X)

Read-only / informational:
- Worker who submitted, when
- Confidence score
- All flags with explanatory tooltips
- Audit log entries for this item

**Right side / footer — Actions**
- "Approve & Publish" button (yellow `#F9D923`)
- "Regenerate AI" button (re-runs AI generator, replaces `ai_*` columns)
- "Reject" button (sets status to `archived` with a flag for the worker)
- "Save Edits (don't approve)" button (saves admin edits without flipping status)

#### 5C. Approval logic

When admin clicks "Approve & Publish":

1. Compute `published_*` values: for each field, use `admin_*` if set, else `ai_*`.
2. Update the item: set all `published_*` columns, set `published_at`, set `admin_approved_at`, set `admin_approved_by`.
3. Update `status` from `pending` to `published`.
4. Insert audit_log row: `action='admin_approved'`, `actor_type='admin'`, metadata includes any admin overrides.

#### 5D. Regenerate AI logic

When admin clicks "Regenerate AI":

1. Confirm with admin (this is destructive to AI columns): "Regenerate AI listing? Current AI output will be replaced. Your manual edits in admin_* fields will be preserved."
2. Set `status` back to `processing` temporarily.
3. Re-run the AI processor (same code as Phase 4).
4. When complete, status returns to `pending`. New `ai_*` values populate. `admin_*` values untouched.

#### 5E. Quick Approve (one-tap)

For items with confidence ≥ 0.8 AND zero flags AND no `admin_*` overrides set, show a green "Quick Approve" button on the pending list itself. Tapping it skips the detail editor and approves directly.

For items with flags or low confidence, the Quick Approve button does NOT appear. Admin must open the detail view first.

### Test

- Submit 5 test items with varying quality (clean photos, blurry barcode, ambiguous category, etc.).
- Verify each appears in pending with appropriate confidence + flags.
- Quick-approve a high-confidence item. Verify it goes to published.
- Edit and approve a flagged item. Verify admin_* values are preserved alongside ai_*.
- Click Regenerate on an item. Verify it re-runs and updates ai_* without losing admin_*.
- Reject an item. Verify status=archived but Cloudinary photos still exist.

### Don't break

- The current admin login / auth flow.
- Any other admin-only functionality (scrap approvals, etc. from the appliance tracker).

---

## PHASE 6 — Public Site Rendering Updates

**Goal:** When an item has `status='published'`, render it on bufaisal.ae using `published_*` values. The public site reads only published values.

### Audit first

- Find the current product page rendering code.
- Identify which columns the page currently reads.

### Build

#### 6A. Switch reads from old columns to `published_*`

Wherever the public site previously read from `title`, `description`, `category`, `price`, etc. — switch to `published_seo_title`, `published_description`, `published_category`, `worker_price_aed`, etc.

Note: `worker_price_aed` is the price source by default. If admin overrode the price during approval (via the `admin_price_aed` column added in Phase 1B), the public site uses that instead. Default price source order: `admin_price_aed` if set, else `worker_price_aed`. Same fallback pattern applies to negotiable: `admin_negotiable` if set, else `worker_negotiable`.

#### 6B. Schema markup injection

In the product page `<head>`:

```html
<script type="application/ld+json">
  {{ published_product_schema }}
</script>
<script type="application/ld+json">
  {{ published_faq_schema }}
</script>
```

Both come straight from the JSONB columns. They're already valid JSON-LD per the prompt's output spec.

#### 6C. Negotiate button (WhatsApp pre-fill)

The CTA button uses the locked WhatsApp pre-fill format:

```
Hi! I saw this on bufaisal.ae and want to negotiate.
Is it still available?

📦 [published_seo_title]
💰 [worker_price_aed] AED
📍 [shop_name], Ajman
🔖 [worker barcode or ai_barcode_extracted]
```

URL-encoded into a `wa.me/971585932499?text=...` link.

For New (custom-made) items, slight variation: "Hi! I saw this on bufaisal.ae and want to order this custom item." Otherwise same structure.

#### 6D. Trust strip + footer + everything else

Out of scope for this spec. Reference `Bufaisal-Website-Architecture-v1.0.docx` for the full public site design.

### Test

- Approve an item from admin. Verify it appears on bufaisal.ae at the expected slug URL.
- Verify the schema markup is in the page source.
- Click Negotiate on a product page. Verify WhatsApp opens with the pre-filled message.
- Inspect Google Rich Results Test on the URL — verify Product and FAQPage schemas validate.

### Don't break

- Existing published items continue to render. (They may not have `published_*` columns populated. Handle this with a fallback: if `published_*` is null, use the legacy column.)

---

## PHASE 7 — Migrate Existing Items (Optional, Post-Launch)

**Goal:** For items already in production with the old schema, regenerate them with the new prompt to upgrade quality.

**This is optional. Do NOT do this in v1 launch unless Hamzah explicitly requests it.** Existing listings keep working with their legacy columns. Only NEW items use the new flow.

If migration is requested later:

1. For each item with `status='published'` and `ai_prompt_version IS NULL`:
   - Re-run the AI processor with the existing photos.
   - Save to `ai_*` columns (don't overwrite existing legacy columns).
   - Set `status='pending'` for admin review (admin can choose to re-publish with new content).

This is a long-running batch job. Build a UI in admin to opt-in per item or in batches.

---

## PHASE 8 — Monitoring & Daily Summary

**Goal:** Hamzah, Yousuf, and Ahmed see what happened each day without having to log in and check.

### Build

#### 8A. Daily summary endpoint

`GET /api/admin/daily-summary` — returns:

- Total items submitted today
- Total items processed by AI today
- Total items approved today
- Total items rejected today
- Items currently in pending queue
- Items stuck in processing > 10 minutes (should always be 0)
- Top 3 flag types raised today
- Average confidence score today

#### 8B. Daily WhatsApp message (later — Phase 2)

Tie into the planned WhatsApp bot architecture. Send the daily summary at end of business each day. Defer to the WhatsApp bot project.

For v1 launch, the summary endpoint is enough. Admin can bookmark it.

### Test

- After a day of intake activity, verify the summary returns sensible numbers.

---

## PHASE 9 — Cleanup & Documentation

**Goal:** Code is clean, documented, and future-Claude-Code can find its way around.

### Build

#### 9A. Update repo README

Add a section explaining:
- The intake flow (worker → AI → admin → published)
- Where the prompt lives (`lib/prompts/listing-generator-v1.md`)
- Where the docs live (link to the 4 companion docs)
- The state machine and what each status means

#### 9B. Code comments

Every file that handles photo URLs, AI generation, or schema separation gets a header comment pointing to the relevant Decisions Log entry.

Example:
```typescript
/**
 * Worker upload submission handler.
 *
 * Architecture: items submit with status='processing', AI runs async,
 * status flips to 'pending' for admin review.
 *
 * See: Bufaisal-Decisions-Log-v1.1-Addendum.docx, decisions 2026-05-07
 * #1, #2, #3, #6.
 *
 * CRITICAL: Worker input goes to worker_* columns. AI never overwrites these.
 * Cloudinary photos are permanent — never auto-delete.
 */
```

#### 9C. Decommission old code

After Phases 1–6 are confirmed working in production:
- Delete the old AI scan button code from worker upload (already done in Phase 3, but verify no dead imports).
- Delete the legacy synchronous AI generation code path.
- Keep `gemini.ts` until end of May 2026 per existing memory; then remove in PR #12 as planned.

### Test

- New developer (or Claude Code in a fresh session) can clone the repo, read the README, and understand the system in under 30 minutes.

---

## Acceptance Criteria — When This Project Is "Done"

The project is complete when:

1. ✅ A worker can upload an item in under 60 seconds on a real phone with normal UAE 4G.
2. ✅ Submit returns in under 2 seconds.
3. ✅ The worker never sees an AI button on their screen.
4. ✅ Photos persist on Cloudinary forever — verified by rejecting an item and confirming the photo URL still works.
5. ✅ AI processes items in 1–3 minutes after submit, populating all `ai_*` columns.
6. ✅ Admin opens `/admin` and sees pending items with AI-filled fields, confidence scores, and flags.
7. ✅ Admin can quick-approve high-confidence flag-free items in one tap.
8. ✅ Admin can edit and approve flagged items via the detail editor.
9. ✅ Admin can regenerate AI on bad listings without losing manual edits.
10. ✅ Approved items appear on bufaisal.ae with correct schema markup.
11. ✅ Clicking Negotiate opens WhatsApp with the locked pre-fill format.
12. ✅ A test refrigerator gets categorized as Appliances, not Kitchen & Dining.
13. ✅ A test custom new sofa is labeled "New" — not "Bufaisal Custom" — anywhere.
14. ✅ The constant FAQ #4 about delivery to all 7 emirates appears identically on every published item.
15. ✅ No items are stuck in `processing` longer than 10 minutes.
16. ✅ The audit_log table has entries for every submission, AI run, and approval.
17. ✅ All existing routes (`/team`, `/admin`, `/appliance-tracker`, `/api/appliances`) still work without regression.

---

## Order of Execution Recap

1. **Phase 0** — Audit + report findings to Hamzah, wait for approval
2. **Phase 1** — Database migration (schema + audit_log)
3. **Phase 2** — Photo upload optimization (compression, capture-time, Cloudinary persistence)
4. **Phase 3** — Worker upload screen rebuild
5. **Phase 4** — Background AI processor + new system prompt
6. **Phase 5** — Admin pending dashboard
7. **Phase 6** — Public site rendering updates
8. **Phase 7** — Existing items migration (optional, post-launch)
9. **Phase 8** — Monitoring + daily summary
10. **Phase 9** — Cleanup + documentation

After each phase, Hamzah tests on real phones and approves before the next phase starts.

---

## Communication Protocol

- Before starting any phase: post a short message in Claude Code summarizing what you're about to do.
- After completing a phase: post a written summary of what was changed, what files were touched, and any deviations from this spec.
- If any deviation is needed: ASK FIRST. Do not refactor sacred routes or rewrite working code without explicit approval.
- If anything in this spec conflicts with reality on the ground: STOP, report, and wait for guidance.

Hamzah's preference per memory: investigate and conclude directly rather than asking the user to verify steps. So: do the work, report the results, don't ask Hamzah to test things you can verify yourself.

But when in doubt about strategy or architecture: ask. Better to pause for 5 minutes than build the wrong thing for an hour.

---

## Change Log

- **v1.0.1 (May 7, 2026):** Patch update before first deploy.
  - Fixed Phase 4A: replaced "fire-and-forget" pattern (which silently fails on Vercel) with three viable options (waitUntil from @vercel/functions, Vercel cron polling, or Supabase webhook). Recommended waitUntil for v1 on Hobby tier.
  - Fixed Phase 4E: Anthropic SDK example now formats user message as readable structured text instead of raw JSON.stringify, and shows correct response parsing pattern using content array find by type.
  - Added missing admin override columns to Phase 1B: admin_slug, admin_image_alt_texts, admin_geographic_anchor, admin_internal_link_targets, admin_price_aed, admin_negotiable.
  - Updated Phase 6A to reference these now-existing columns instead of saying "add this column if not added in Phase 1."
  - Added required env vars: INTERNAL_API_SECRET, NEXT_PUBLIC_BASE_URL.
- **v1.0 (May 7, 2026):** Initial spec. Built from locked architecture (Decisions Log v1.0 + v1.1 Addendum), locked SEO Agent v1.0, and locked Listing Generator Prompt v1.0 FINAL. Ready for Claude Code execution.

*End of document.*
