# Diesel Tracker Agent — MVP Plan

**Owner:** Hamzah (Bu Faisal)
**Started:** April 16, 2026
**Status:** Pre-build, scope locked

---

## What we're actually building (honest version)

A system that logs every diesel fill for Bu Faisal trucks, calculates fuel economy per truck, flags outliers, and eventually detects theft once supplier invoices can be reconciled against logged fills.

**Not** a silver bullet against theft. Photo-based logging cannot catch siphoning-after-fill, pump/driver collusion, or replayed photos without added signals (GPS, tank sensors, digital invoices). That's phased below.

---

## Decisions locked in this session

| Decision | Answer | Notes |
|---|---|---|
| Primary goal | Phased: compliance → efficiency → theft | Each phase unlocks the next |
| Fleet composition | Similar trucks | Fleet average is a valid v2 baseline |
| Fuel invoices today | Paper only | Blocks theft reconciliation until digitized |
| V1 inputs per fill | Plate + odometer + pump screen photos | Fraud risk: pump screen can be replayed. Add receipt capture in v2 |
| Code location | `bufaisal.ae/diesel` (same project as marketplace/appliance tracker) | Reuses Supabase, Gemini, Cloudinary |
| Ingest method | **PENDING** — depends on WhatsApp Business API status | See next section |

---

## The WhatsApp reality check

Your original spec assumed WhatsApp Business API is ready. It's almost certainly not — two products share the name:

1. **WhatsApp Business App** (free Play Store app, manual chat). Cannot be automated. Cannot receive photos programmatically. A bot cannot plug into it.
2. **WhatsApp Business Platform / Cloud API** (developer product). What your spec needs. Requires Meta Business Verification (1–3 weeks review), a dedicated phone number not used on any other WhatsApp, approved message templates for outbound reports.

**30-second test:** log into `developers.facebook.com/apps` and look for an app with "WhatsApp" added as a product, a test phone number, and an access token. If that exists, you're ready to go API-direct. If not, you have the Business App and need to start verification.

### Two paths based on what you have

- **Path A (default — assume you don't have API yet):** Ship a mobile web form at `bufaisal.ae/diesel` this week. Diesel guy opens link from the existing WhatsApp ops chat, snaps 3 photos, confirms Gemini's readings, submits. Start Meta verification in parallel. When approved (2–4 weeks), swap ingest layer to direct WhatsApp webhook. **Same backend either way.**
- **Path B (if API is already live):** Skip the web form, build directly against WhatsApp Cloud API webhook. Shaves a week off. Same schema, same calc engine, different ingest.

---

## Phases (realistic timeline)

### Phase 1 — Compliance / Visibility (this week)
- Supabase tables: `trucks`, `diesel_fills`, `diesel_audit_log`
- Fleet seeded with real truck plate numbers (no phantom trucks from OCR errors)
- Gemini OCR pipeline for plate + odometer + pump screen (parallel calls)
- Mobile web form with confirm-before-submit (human catches OCR mistakes)
- PIN/phone whitelist gating
- Supabase Storage for photos
- Manager dashboard page listing all fills, CSV export
- Daily total sent to Hamzah's WhatsApp/email/Telegram at midnight

**Deliverable:** A record of every fill, manually triggered per fill, with photos and extracted numbers.

### Phase 2 — Efficiency flagging (weeks 2–3)
- Per-truck rolling L/100km baseline (last 10 fills, not fleet average — that alarms too often on mixed routes)
- Variance flag only after truck has ≥5 fills logged (no false alarms on new trucks)
- Flagged fills surface in manager dashboard with one-click "false alarm" / "investigate" buttons
- Weekly + monthly summaries

### Phase 3 — Theft detection (month 2+)
- **Requires:** fuel supplier invoices to be digital (PDF per month per truck minimum)
- Monthly reconciliation: `sum(logged liters per truck) vs. invoiced liters per truck` → any gap = investigate
- Add receipt photo to intake (timestamp + liters + station ID — much harder to fake than pump screen)
- Optional: GPS/telematics integration if your trucks have trackers

---

## What needs to happen OUTSIDE this chat before v1 ships

These are blockers I cannot do for you. None of them are hard individually, but they need a human.

1. **Find your dev / confirm who pushes code to Vercel.** The code I write sits in your project folder until someone deploys it. Is that you? A friend? An agency? If you don't have one — that's the first hire, or tell me and we'll discuss options.
2. **Meta Business Verification** — start at `business.facebook.com`. Needs trade license, proof of address, possibly a website verification. Start TODAY even if we're going Path A, because it gates Phase 1.5.
3. **Seed the truck list.** I need the plate number of every truck in the fleet. Phantom trucks from OCR errors are a real risk — the system must reject unknown plates, not invent them.
4. **Whitelist diesel guy's phone number.** What phone number(s) submit fills? Give me the exact numbers, with country code.
5. **Ops phone number for reports.** Where do daily summaries go?
6. **Supabase Storage bucket** — needs a new bucket `diesel-photos` with appropriate policies. Your dev does this in the Supabase dashboard, or I write instructions.

---

## What I'm shipping in this chat (artifacts you'll be able to hand to a dev)

- `DIESEL-TRACKER-PLAN.md` — this doc
- `supabase-diesel-schema.sql` — tables + RLS policies, ready to paste into Supabase SQL editor
- `src/app/diesel/` — mobile web form pages (Phase 1 Path A)
- `src/app/api/diesel/submit-fill/route.ts` — backend endpoint that receives 3 photos, runs Gemini, calculates, writes to Supabase. Callable from web form OR WhatsApp webhook later (same endpoint).
- `src/lib/diesel/` — calc engine, Gemini prompts, types
- `src/app/api/diesel/daily-summary/route.ts` — Vercel cron endpoint that sends daily summary

---

## Things I am deliberately NOT building in v1 (to protect the timeline)

- Google Sheets sync (you said "backup" — Supabase IS the backup. Dashboards are a v2 concern.)
- Per-truck efficiency flagging (Phase 2)
- WhatsApp webhook ingest (Phase 1.5 — depends on Meta)
- Message templates for outbound reports
- Manager dashboard beyond a simple list + CSV
- Arabic language UI (nothing stopping it later, just not v1)

---

## Risks I'm flagging loudly

1. **OCR accuracy is unverified.** We need 20+ real photos from your pumps/trucks to measure Gemini accuracy before rolling out. If plate OCR is <95%, manual truck selection from a dropdown is required instead. I'll build the dropdown either way as a fallback.
2. **Pump screen photo is the weakest fraud signal** in the stack. Driver can replay yesterday's photo. Not a v1 blocker, but don't believe any single fill without the pattern of a week's data.
3. **"KM since last fill" breaks silently if a fill is missed.** v2 needs an anomaly check: if `km_since_last > 500km` OR `days_since_last > 7`, mark for review — something was probably not logged.
4. **No GPS = no verification that the odometer photo is current.** Mitigation: the web form timestamps the submission + requires photos taken via the in-page camera (not gallery upload). Gallery upload is the easy fraud path. Camera-only capture forces a fresh photo.
5. **In-memory rate limiter resets on Vercel deploy** (per your existing tech debt list). Same issue will apply here. Log-and-move-on for v1.

---

## Next action for YOU

Answer two things:

1. Who deploys code to Vercel? (You, a dev you work with, or "I don't have one yet"?)
2. Log into `developers.facebook.com/apps` on your phone. Screenshot what you see. That tells us instantly if you're Path A or Path B.

Once I know those, I start writing the schema + backend + form tonight.
