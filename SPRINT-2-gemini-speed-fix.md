# Sprint 2: Fix Gemini Upload Speed (Team Upload Portal)

## Context for Claude Code

You're working on bufaisal-website, a Next.js 14.2 platform. Read CLAUDE.md for full project context.

The **team upload portal** (`/team`) lets shop workers upload used items for the marketplace. It has an AI scan feature (Gemini 2.5-flash-lite) that auto-fills item name, brand, category, condition, barcode, and SEO fields from photos. **The problem: it takes 3-5 minutes per item upload because the Gemini pipeline is slow.** This is so bad that the team avoids using the AI feature, which kills the path toward autonomous agent operations.

## The Bottleneck (confirmed by code audit)

The current flow in `src/app/team/page.tsx` is:

1. Worker takes photo → uploads to Cloudinary (blocks UI)
2. Worker clicks "AI Scan" → `compressImage()` **re-downloads** the Cloudinary URL, compresses to 800px JPEG 0.7
3. Converts to base64 string (~500KB-1MB)
4. Sends that base64 blob to `/api/gemini` over mobile network
5. `/api/gemini` forwards the base64 to Google's Gemini API (another network hop with huge payload)
6. Waits for Gemini response
7. **Steps 2-6 repeat SEQUENTIALLY for the barcode photo**

Total: 2 Cloudinary uploads + 2 image re-downloads + 2 base64 compressions + 2 large POST requests to our API + 2 Gemini API calls. ALL sequential. On shop floor wifi, this is brutal.

## What to Fix

### Priority 1: Eliminate the re-download and run in parallel

The images are ALREADY uploaded to Cloudinary before AI scan runs. Gemini supports image URLs directly via `fileData` — use that instead of downloading, compressing, base64-encoding, and re-uploading.

**In `/api/gemini/route.ts`:**
- Add a new code path: if the request sends `imageUrl` instead of `imageBase64`, use Gemini's URL-based input
- Keep the base64 path as fallback for the appliance tracker which uses camera capture → base64 directly
- Gemini 2.5-flash-lite supports `fileData` with `fileUri` for Google Cloud Storage URIs, OR you can pass the image URL via a `text` part asking it to analyze the image at that URL — test which approach works with Cloudinary URLs

**Actually, the simplest fix:** Gemini's `inline_data` requires base64, but the real fix is to compress BEFORE uploading to Cloudinary, not after. The current flow uploads the full-res image to Cloudinary, THEN downloads it again to compress. Instead:

1. Camera capture → compress to 800px JPEG immediately on the client
2. Upload the ALREADY compressed image to Cloudinary
3. Send the SAME compressed base64 (which you already have from step 1) to Gemini
4. Run Cloudinary upload and Gemini call IN PARALLEL with `Promise.all()`

### Priority 2: Run both Gemini calls in parallel

In `handleGeminiAI()`, the item photo scan and barcode scan run sequentially. Use `Promise.all()` or `Promise.allSettled()` to run both simultaneously.

### Priority 3: Make AI non-blocking

Don't make the worker wait for AI. Instead:
- Auto-trigger AI scan in the background the moment each photo is captured
- Show the form immediately with empty fields
- When AI results come back, populate the fields with a subtle animation
- Worker can fill fields manually and submit anytime — AI results merge in when ready

### Priority 4: Add loading states per field

Instead of one big spinner, show a small shimmer/skeleton on each field that AI will fill. When the result arrives, animate it in.

## Files to Modify

- `src/app/team/page.tsx` — Main upload portal (the big one)
- `src/app/api/gemini/route.ts` — Gemini API route (may need URL-based input)
- `src/app/appliances/shop/in/page.tsx` — Appliance intake (uses same Gemini endpoint for barcode scan, apply same parallel pattern)

## Constraints

- **DO NOT change the Gemini model** — it's `gemini-2.5-flash-lite` on a paid Tier 1 account
- **DO NOT remove the AI feature** — fix it, don't skip it
- **Mobile-first** — workers use phones on the shop floor, big buttons, minimal typing
- **Keep the compress function** — 800px max, JPEG 0.7 quality is correct for Gemini input size
- All server-side writes use `supabaseAdmin` via admin-api.ts (already set up)

## Success Criteria

- Single item upload with AI scan takes under 15 seconds total (down from 3-5 minutes)
- AI scan runs in background while worker can interact with form
- Both photo scans (item + barcode) run in parallel
- No re-downloading of already-uploaded images
- Appliance tracker barcode scan also benefits from the speed fix

## How to Test

1. Go to `/team`, select a shop, enter password, enter name
2. Upload an item photo and barcode photo
3. AI scan should auto-trigger or be near-instant when clicked
4. Form fields should populate within 3-5 seconds
5. Worker should be able to submit before AI finishes (manual fields take priority)
