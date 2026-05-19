# bufaisal.ae — UAE used goods marketplace + internal operations

Next.js 14 platform for a UAE-based second-hand goods business: customer-facing marketplace (bufaisal.ae) plus internal operations apps for shop intake, repair, cleaning, delivery, and diesel tracking across 5 Ajman shops + the Jurf repair warehouse.

**Status:** Phase 8 (in progress) — see [docs/PHASE_STATE.md](docs/PHASE_STATE.md)
**Site:** https://bufaisal.ae

## Tech stack

- Next.js 14.2 (App Router), React 18, TypeScript
- Supabase (Postgres + Row-Level Security)
- Cloudinary (image upload + transforms; custom next/image loader bypasses Vercel's optimizer)
- Vercel (hosting + cron)
- Anthropic API — Claude Sonnet 4.6 for the listing-generator pipeline
- Anthropic API — Claude Haiku 4.5 for barcode scan + diesel route OCR (route name `/api/gemini` is legacy; migrated off Gemini in PR #11)
  - Note: Routes/functions named "gemini" in this repo (`/api/gemini`, `callGemini()`, `gemini_*` DB columns) are legacy names from before PR #11. All AI calls route to Anthropic. See [CLAUDE.md](CLAUDE.md) for migration history.
- Tailwind 3.4, `yet-another-react-lightbox`, Facebook Pixel

## Key docs

- Architecture: [docs/Bufaisal-Website-Architecture-v1.0.docx](docs/Bufaisal-Website-Architecture-v1.0.docx)
- SEO Agent spec: [docs/Bufaisal-SEO-Agent-v1.0.docx](docs/Bufaisal-SEO-Agent-v1.0.docx)
- Decisions Log: [docs/Bufaisal-Decisions-Log-v1.0.docx](docs/Bufaisal-Decisions-Log-v1.0.docx) + [v1.1 Addendum](docs/Bufaisal-Decisions-Log-v1_1-Addendum.docx)
- Implementation Spec: [docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md](docs/Bufaisal-Claude-Code-Implementation-Spec-v1_0_1.md)
- Listing Generator Prompt: [docs/Bufaisal-Listing-Generator-Prompt-v1_0_1.md](docs/Bufaisal-Listing-Generator-Prompt-v1_0_1.md) (also at runtime: [lib/prompts/listing-generator-v1.md](lib/prompts/listing-generator-v1.md))
- Phase ledger: [docs/PHASE_STATE.md](docs/PHASE_STATE.md)
- Project context for Claude / contributors: [CLAUDE.md](CLAUDE.md)

## Run locally

Prereqs: Node 20+, npm.

```bash
npm install
npm run dev   # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm test` (vitest).

### Required env vars

`.env.example` is stale — see CLAUDE.md "Environment Variables" for the authoritative list. Minimum to boot:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` — used by `/api/gemini`, `/api/items/[id]/generate-listing`, `/api/admin/regenerate-listing`, `/api/jobs/generate-listing`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `ADMIN_PIN_HASHES` — JSON array, see `.env.example` for the bcrypt-generation one-liner
- `NEXT_PUBLIC_WHATSAPP_NUMBER`
- `NEXT_PUBLIC_BASE_URL` — used by `/api/team/items` to call the listing-generator internally
- `INTERNAL_API_SECRET` — Bearer auth for `/api/items/[id]/generate-listing` and the cleanup cron

Optional: `NEXT_PUBLIC_FB_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `CRON_SECRET`, `ADMIN_SESSION_SECRET`, `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`.

## Routes

**Public:**

- `/` — homepage
- `/shop` — product feed with filters
- `/item/[id]` — product detail page
- `/categories` — category landing page
- `/about`, `/contact`, `/login`

**Internal (sacred routes — do not break):**

- `/team` — worker upload portal
- `/admin` — admin dashboard (settings, analytics, Live/Sold/Hidden tabs)
- `/admin/pending` — list of items awaiting approval (Phase 5 sidecar)
- `/appliances` — appliance tracker (intake → jurf → cleaning → security → shops)
- `/diesel` — truck fuel tracker
