# Diesel Tracker — Deploy Checklist (Hamzah)

**Goal:** Get `bufaisal.ae/diesel` live so the diesel guy can start logging fills tonight.

**What's built in Pass 1 (this release — phone-testable):**
PIN-gated mobile web form. Diesel guy snaps **4 photos** (plate, driver licence, odometer, pump). Gemini reads the numbers. Trucks and drivers auto-create on first appearance with fuzzy-match safeguards, flagged `needs_review` for manager cleanup. Odometer-regression is a hard reject. Price snapshotted per fill. All stored in Supabase. Works on any phone with a bookmark.

**What's coming in Pass 2:** Manager dashboard at `/diesel/dashboard` with the 6 tabs (Today / Trucks / Drivers / Flagged / Trends / Log), Google Sheets real-time sync, aggregated report endpoints. Scheduled delivery (WhatsApp / email) still waiting on channel decision.

**What's NOT built yet (deferred):** WhatsApp webhook ingest, receipt-timestamp capture, Meta Business Verification workflow.

---

## Step 1 — Run the SQL migration in Supabase

The schema is **additive + idempotent** — safe whether you're running it fresh or on top of a previous version. It uses `create table if not exists` and `alter table add column if not exists` for every new column.

1. Open your Supabase project dashboard.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `supabase-diesel-schema.sql` in this repo. Paste the whole file into the editor.
4. Click **Run** (bottom right). Expect `Success. No rows returned`.
5. Verify in **Table Editor** you now see: `diesel_trucks`, `diesel_drivers`, `diesel_fills`, `diesel_audit_log`, `diesel_authorized_submitters`, `diesel_config`.
6. Views: `v_diesel_fleet_avg_30d`, `v_diesel_truck_stats`, `v_diesel_driver_stats`.

---

## Step 2 — Photo storage

Using existing Cloudinary account (same as appliance photos). Upload preset `bufaisal_unsigned` on cloud `df8y0k626`. **Nothing to do.**

> Privacy note: licence photos contain driver ID / name / expiry. Cloudinary URLs are public-by-guess if someone knows the asset ID. Acceptable for Pass 1 (the URLs are long random strings). When you have bandwidth, migrate diesel photos to a **private** Supabase Storage bucket or a signed-URL Cloudinary preset. I flagged it; your call when.

---

## Step 3 — Seeding trucks and drivers (OPTIONAL)

Per your decision, the system **auto-creates** trucks and drivers the first time they're seen. You do NOT need to seed anything to go live.

When auto-create fires, the new row gets `needs_review = true`. The dashboard (Pass 2) will surface these so you can:

- Confirm the plate OCR was correct (edit `plate_display` if needed).
- Merge duplicates (e.g. two rows for the same truck because OCR read the letters differently — will happen).
- Rename drivers if Gemini got the transliteration wrong.

If you want to **pre-seed** anyway (recommended for known fleet — makes fuzzy-match land on real trucks from fill #1):

```sql
-- Trucks: plate_number MUST be uppercase, no spaces/dashes
insert into public.diesel_trucks (plate_number, plate_display, nickname) values
  ('AJMA12345', 'AJM-A-12345', 'Truck 12'),
  ('AJMB67890', 'AJM-B-67890', 'Truck 15')
  -- ... more
on conflict (plate_number) do nothing;

-- Drivers (optional): name_normalized must be lowercase, stripped
insert into public.diesel_drivers (full_name, name_normalized) values
  ('Ahmad Hassan',  'ahmad hassan'),
  ('Mohammed Ali',  'mohammed ali')
on conflict (name_normalized) do nothing;
```

If you skip seeding, just go live. Every fill will create what it needs, and you'll clean up in the dashboard.

---

## Step 4 — Set the submitter PIN

The diesel guy enters a PIN before logging any fill. The PIN is stored as a bcrypt hash — same pattern as your shop passwords.

**Option A — online bcrypt generator (fastest):**

1. Go to https://bcrypt-generator.com/
2. Set **Rounds: 10**
3. Enter the PIN (e.g. `4812` — **do NOT use `1234` except for your own phone test**)
4. Copy the generated hash — starts with `$2a$10$...` or `$2b$10$...`
5. In Supabase SQL Editor, run:

```sql
update public.diesel_config
set submit_pin_hash = '$2a$10$PASTE_HASH_HERE';
```

**Option B — locally with node:**

```bash
node -e "console.log(require('bcryptjs').hashSync('4812', 10))"
```

---

## Step 5 — Confirm diesel price default

The schema defaults `default_price_per_liter` to **4.50 AED**. Every fill snapshots this price at submission time on `diesel_fills.price_per_liter_at_fill` so history stays correct if the rate ever changes.

If your negotiated Dubai Diesel rate is different, update it:

```sql
update public.diesel_config
set default_price_per_liter = 4.65;  -- or whatever
```

---

## Step 6 — (optional) whitelist the diesel guy's phone

Not ENFORCED in v1 (PIN is the gate), but logs who submits:

```sql
insert into public.diesel_authorized_submitters (phone_number, name, role)
values ('+971501234567', 'Diesel Guy Name', 'submitter');
```

Phone in **E.164 format**, no spaces.

---

## Step 7 — Deploy the code

Commit and push to Vercel. Files added / changed in Pass 1:

```
src/lib/diesel-calc.ts              — calc engine, driver rolling avg, hard-reject signals, fuzzy helpers
src/lib/diesel-api.ts               — client wrapper, 4-photo OCR, driver + license types
src/app/api/diesel/route.ts         — resolve_plate / resolve_driver / list_drivers actions;
                                      auto-create with fuzzy match; odometer hard-reject
src/app/diesel/page.tsx             — PIN gate (unchanged)
src/app/diesel/submit/page.tsx      — 4-photo capture + review with driver field
src/app/api/gemini/route.ts         — added diesel_license prompt
supabase-diesel-schema.sql          — schema + additive migrations
```

No new env vars needed in Pass 1. Existing required vars:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
```

---

## Step 8 — Test on your phone

1. Open `https://bufaisal.ae/diesel` on your phone.
2. Enter the PIN you set in Step 4.
3. You land on the 4-tile capture screen: **Plate / Licence / Odometer / Pump**.
4. Tap each tile. Camera opens. Take the photo. Wait ~2-3 seconds — you should see a green tick on the tile when upload + OCR is done.
5. Tap **REVIEW**.
6. You should see:
   - Truck dropdown (auto-matched with green tick if plate known, or "New plate will be added on submit" blue hint if novel).
   - Driver dropdown (same logic via licence OCR).
   - Odometer km filled in from OCR.
   - Liters filled in from OCR.
7. Correct anything wrong, then tap **SUBMIT FILL**.
8. You should see `LOGGED` with the confirmation line:
   > `Truck AJM-A-12345 — Ahmad Hassan — 45L — 320km — 14.1 L/100km ✓`
9. Check Supabase `diesel_fills` table — a new row is there with all 4 photo URLs, `driver_id`, `cost_aed`, `price_per_liter_at_fill`.
10. **Test the odometer reject:** submit a second fill for the same truck with an odometer **lower** than the previous. You should get `400 Bad Request` with a clear error — the fill will NOT be inserted. That's the anti-tamper guard working.

---

## Step 9 — Watch-list during the first week

Check `diesel_fills` once a day for the first ~20 fills:

- `corrected_by_human = true` often? → OCR is weak. Look at photos, tune prompt.
- `gemini_confidence_*` < 0.6 often? → same. Consider making dropdown the primary input.
- Trucks or drivers with `needs_review = true` piling up in `diesel_trucks` / `diesel_drivers`? → fuzzy threshold may be too strict. Current default 0.85; can lower to 0.80 in config.
- `flagged = true` rows: look at the photos first. Is it real over-use, an OCR error, or a missed fill in between?
- `anomalies` field: `implausible_km_per_day`, `long_time_gap`, `implausible_l100` — each is a signal worth investigating.

Export `diesel_fills` and `diesel_audit_log` as CSV after 10-20 real fills and send to me. I'll tune Pass 2 thresholds against actual data.

---

## Step 10 — Share with diesel guy

- Share `https://bufaisal.ae/diesel`.
- Send him the PIN privately (NOT in a group).
- Tell him to bookmark or add to home screen.
- **Explain:** for every fill, open the link → enter PIN → 4 photos → confirm → submit. About 60 seconds.

---

## Pass 2 — Dashboard + reports + Sheets sync (IN THIS RELEASE)

Everything below is already in the code. The only user-side work is optional Google Sheets setup.

### Step 11 — Manager dashboard at `/diesel/dashboard`

1. Open `https://bufaisal.ae/diesel/dashboard` on any device.
2. Enter the manager PIN. **First-run shortcut:** if you haven't set a separate manager PIN, the dashboard accepts the same PIN as the submitter form (you'll see a yellow banner noting this). To split them:

   ```sql
   update public.diesel_config
   set manager_pin_hash = '$2a$10$PASTE_BCRYPT_HASH_HERE';
   ```

3. You land on six tabs: **Today / Trucks / Drivers / Flagged / Trends / Log**.
4. A blue **"🔎 N new records — please review"** banner appears at the top whenever trucks or drivers were auto-created from OCR. For each:
   - **Confirm** — marks `needs_review = false`, row becomes canonical.
   - **Merge into…** — pick an existing truck/driver; all fills from the duplicate move over, and the duplicate is deactivated. Audit log records the merge.

### Step 12 — (optional) Google Sheets service-account sync

**If you skip this step: nothing breaks.** The feature flag is off when env vars aren't set. Every fill lands in Supabase either way.

One-time setup (~10 minutes):

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a new project called "Bu Faisal Diesel" (or reuse one you have).
2. In the sidebar: **APIs & Services → Library** → search "Google Sheets API" → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name: `diesel-sheets-sync`
   - Skip optional role assignment, click Done.
4. Click the new service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads — don't share it.
5. Open the JSON. You need three values:
   - `client_email` (looks like `diesel-sheets-sync@…iam.gserviceaccount.com`)
   - `private_key` (starts with `-----BEGIN PRIVATE KEY-----`)
   - plus you'll need a Google Sheet ID (see step 6)
6. Create a new Google Sheet. Name it **"Bu Faisal Diesel Tracker"**. Copy the spreadsheet ID from the URL (`https://docs.google.com/spreadsheets/d/THIS_PART/edit`).
7. **Share the sheet** with the `client_email` from step 5. Give it **Editor** access. This is the step people forget — without it the sync will 403.
8. In Vercel, **Settings → Environment Variables**, add:

   ```
   DIESEL_SHEETS_CLIENT_EMAIL    = diesel-sheets-sync@...iam.gserviceaccount.com
   DIESEL_SHEETS_PRIVATE_KEY     = -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   DIESEL_SHEETS_SPREADSHEET_ID  = <the ID from step 6>
   DIESEL_SHEETS_TAB_NAME        = Fills            # optional; defaults to "Fills"
   ```

   **Important:** when you paste the private key into Vercel's UI, keep the literal `\n` sequences. The sync code replaces them with real newlines at runtime.

9. Redeploy (Vercel will auto-redeploy on env var save, or trigger manually).
10. Submit one test fill from `/diesel/submit`. Within a second or two it should appear as a new row in the sheet, and the header row auto-populates on first write.

**If Sheets sync fails:** the fill still saves to Supabase. Failures are logged to `diesel_audit_log` with `action = 'sheets_sync_failed'`. Check that table when debugging.

### Step 13 — Test the dashboard on your phone

After Step 7 (code deployed) and Step 8 (one test fill logged):

1. Visit `/diesel/dashboard`, enter PIN.
2. **Today** tab: you should see your test fill + total liters/cost.
3. If your test was a first-ever fill, the test plate and driver appear in the blue **Needs Review** banner. Hit **Confirm** on each.
4. **Trucks** tab: your truck is in the list with its avg L/100km (just your test fill, no baseline yet).
5. **Drivers** tab: same for the driver.
6. **Flagged** tab: empty unless the test was flagged.
7. **Trends** tab: shows a daily-liters bar chart and weekly/monthly summary cards.
8. **Log** tab: paginated list with "Flagged only" filter. Expand a row's **show photos** to confirm all 4 photos uploaded.

### Step 14 — Report endpoints (available now)

Three actions are live on `/api/diesel` that return JSON aggregations:

- `report_daily` — last 24h
- `report_weekly` — last 7d
- `report_monthly` — last 30d

Each returns: `total_fills`, `total_liters`, `total_cost_aed`, `fleet_avg_l100`, `flag_count`, top-10 `worst_trucks` + `worst_drivers` by avg L/100km, and the anomaly list. The dashboard's Trends tab renders these.

**Scheduled delivery is NOT wired yet** — there's no channel (email/WhatsApp) decided. When you pick one, the cron+send layer is a ~30-minute add-on.

---

## Still deferred

| Feature | Why deferred | Next step |
|---|---|---|
| Scheduled report delivery (WA/email) | Waiting for you to pick a channel | Say the word, I wire Resend (email) or WA webhook (once Meta verified) |
| Receipt timestamp capture (anti-replay) | Separate photo + OCR tuning | Phase 3, after ~50 real fills are logged |
| WhatsApp webhook ingest | Needs Meta Business Verification | Phase 2 (weeks, not days) |
| Per-truck baseline instead of fleet avg (auto) | Already done — system prefers truck → driver → fleet baseline automatically | Nothing to do |

## One ask from me

Start **Meta Business Verification** this week if you want the WhatsApp-direct path eventually. ~30 minutes of admin work now saves 2 weeks later. Do it in parallel with the rollout.

Once you have 10-20 real fills logged, export `diesel_fills` and `diesel_audit_log` as CSV and send them. I'll read OCR accuracy, variance distribution, flag false-positive rate, and tune thresholds against real data instead of guessing.
