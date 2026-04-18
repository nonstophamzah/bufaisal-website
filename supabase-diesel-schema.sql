-- ============================================================
-- Diesel Tracker Schema — Phase 1 (Compliance/Visibility)
-- Bu Faisal fleet fuel tracking
-- ============================================================
-- Apply this in the Supabase SQL editor. Safe to re-run (idempotent).
-- Owner: Hamzah. Reviewed by Claude ruthless-mentor mode, April 17 2026.
--
-- Design notes:
--   * All writes are server-side via supabaseAdmin (service_role). No anon writes.
--   * RLS policies deny anon by default on all tables (no public read of fill data).
--   * Trucks and drivers AUTO-CREATE on first encounter (user preference, April 17).
--     To prevent OCR-error duplicates, auto-created rows are flagged needs_review=true
--     and the API layer runs fuzzy-match first. Dashboard exposes merge/cleanup.
--   * Driver stats are per-driver regardless of which truck they're in (holiday swaps).
--   * price_per_liter_at_fill is SNAPSHOTTED per fill so historical cost stays correct
--     when Dubai Diesel renegotiates the rate.
--   * All photos stored in Cloudinary (same account as appliance photos).
--   * audit_log is append-only; every fill submission writes one row.
-- ============================================================

-- ---------- 1. TRUCKS ----------
create table if not exists public.diesel_trucks (
    id                uuid primary key default gen_random_uuid(),
    plate_number      text not null unique,          -- normalized: uppercase, no spaces
    plate_display     text not null,                 -- original formatting for UI
    truck_type        text,                          -- pickup / flatbed / reefer / etc. (free-form for now)
    nickname          text,                          -- optional short name, e.g. "Truck 12"
    active            boolean not null default true, -- deactivate retired trucks
    needs_review      boolean not null default false,-- auto-created from OCR, manager should confirm
    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- backfill column for installs that ran the pre-April-17 schema
alter table public.diesel_trucks add column if not exists needs_review boolean not null default false;

create index if not exists idx_diesel_trucks_plate          on public.diesel_trucks(plate_number);
create index if not exists idx_diesel_trucks_active         on public.diesel_trucks(active);
create index if not exists idx_diesel_trucks_needs_review   on public.diesel_trucks(needs_review) where needs_review = true;

-- ---------- 1b. DRIVERS ----------
create table if not exists public.diesel_drivers (
    id                uuid primary key default gen_random_uuid(),
    full_name         text not null,                 -- as displayed (e.g. "Ahmad Hassan Al-Marri")
    name_normalized   text not null unique,          -- lowercase, diacritics stripped, single-spaced
    license_number    text,                          -- from OCR, nullable
    employee_id       text,                          -- internal HR id if you have one
    phone             text,
    nickname          text,
    active            boolean not null default true,
    needs_review      boolean not null default false,-- auto-created from OCR
    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists idx_diesel_drivers_name_norm     on public.diesel_drivers(name_normalized);
create index if not exists idx_diesel_drivers_active        on public.diesel_drivers(active);
create index if not exists idx_diesel_drivers_needs_review  on public.diesel_drivers(needs_review) where needs_review = true;
create index if not exists idx_diesel_drivers_license       on public.diesel_drivers(license_number) where license_number is not null;

-- ---------- 2. FILLS ----------
create table if not exists public.diesel_fills (
    id                       uuid primary key default gen_random_uuid(),
    truck_id                 uuid not null references public.diesel_trucks(id) on delete restrict,
    driver_id                uuid references public.diesel_drivers(id) on delete set null,

    -- core readings
    odometer_km              numeric(10,1) not null check (odometer_km >= 0),
    liters_filled            numeric(8,2)  not null check (liters_filled > 0 and liters_filled < 2000),

    -- pricing snapshot (per-fill so history stays correct when rate changes)
    price_per_liter_at_fill  numeric(6,3),               -- AED per liter at time of fill
    cost_aed                 numeric(10,2),              -- liters_filled * price (for reports)

    -- derived fields (computed at insert time; may be null for first fill of a truck)
    previous_fill_id         uuid references public.diesel_fills(id),
    km_since_last            numeric(10,1),
    liters_per_100km         numeric(6,2),
    truck_rolling_avg_l100   numeric(6,2),         -- truck's own rolling avg (last N fills, excl this one)
    driver_rolling_avg_l100  numeric(6,2),         -- driver's rolling avg across any truck
    fleet_avg_l100_at_time   numeric(6,2),         -- fleet-wide avg at submission time
    variance_percent         numeric(6,2),         -- vs truck_rolling_avg if available, else fleet
    flagged                  boolean not null default false,
    flag_reason              text,

    -- provenance / anti-fraud signals
    submitted_by_phone       text,                -- whitelisted number
    submitted_by_name        text,
    submitted_via            text not null default 'web_form'  check (submitted_via in ('web_form','whatsapp','manual')),
    gemini_confidence_plate   numeric(3,2),       -- 0.00 - 1.00 if Gemini returns it
    gemini_confidence_odo     numeric(3,2),
    gemini_confidence_pump    numeric(3,2),
    gemini_confidence_license numeric(3,2),
    corrected_by_human       boolean not null default false,  -- true if human edited OCR output before submit

    -- photos (URLs to Cloudinary)
    photo_plate_url          text not null,
    photo_license_url        text,                 -- nullable to stay backward-compatible with v1 installs
    photo_odometer_url       text not null,
    photo_pump_url           text not null,

    -- raw Gemini output kept for debugging / re-training
    gemini_raw               jsonb,

    -- timestamps
    logged_at                timestamptz not null default now(),  -- when system recorded
    fill_timestamp           timestamptz,                         -- if reliably extractable from receipt (v2)
    created_at               timestamptz not null default now()
);

-- Backfill columns for installs that ran the pre-April-17 schema
alter table public.diesel_fills add column if not exists driver_id                 uuid references public.diesel_drivers(id) on delete set null;
alter table public.diesel_fills add column if not exists driver_rolling_avg_l100   numeric(6,2);
alter table public.diesel_fills add column if not exists price_per_liter_at_fill   numeric(6,3);
alter table public.diesel_fills add column if not exists cost_aed                  numeric(10,2);
alter table public.diesel_fills add column if not exists photo_license_url         text;
alter table public.diesel_fills add column if not exists gemini_confidence_license numeric(3,2);

create index if not exists idx_diesel_fills_truck_time   on public.diesel_fills(truck_id, logged_at desc);
create index if not exists idx_diesel_fills_driver_time  on public.diesel_fills(driver_id, logged_at desc);
create index if not exists idx_diesel_fills_logged_at    on public.diesel_fills(logged_at desc);
create index if not exists idx_diesel_fills_flagged      on public.diesel_fills(flagged) where flagged = true;

-- ---------- 3. AUDIT LOG ----------
create table if not exists public.diesel_audit_log (
    id            uuid primary key default gen_random_uuid(),
    action        text not null,       -- submit_fill, reject_fill, edit_truck, flag_override, export_csv, merge_truck, merge_driver, etc.
    actor_phone   text,
    actor_name    text,
    target_id     uuid,                -- fill_id or truck_id depending on action
    details       jsonb,               -- full context for the action
    ip_address    text,
    user_agent    text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_diesel_audit_created on public.diesel_audit_log(created_at desc);
create index if not exists idx_diesel_audit_action  on public.diesel_audit_log(action);

-- ---------- 4. AUTHORIZED SUBMITTERS ----------
-- Whitelist. Phone numbers in E.164 format (+971501234567). No WhatsApp msgs from
-- non-whitelisted numbers pass through the agent.
create table if not exists public.diesel_authorized_submitters (
    id              uuid primary key default gen_random_uuid(),
    phone_number    text not null unique,
    name            text not null,
    role            text not null default 'submitter' check (role in ('submitter','viewer','admin')),
    active          boolean not null default true,
    created_at      timestamptz not null default now()
);

-- ---------- 5. CONFIG (PINS, thresholds, pricing) ----------
-- Single-row config table. Stores the PIN for the mobile web form (bcrypt),
-- the flagging variance threshold, rolling-window size, and default fuel price.
create table if not exists public.diesel_config (
    id                            uuid primary key default gen_random_uuid(),
    submit_pin_hash               text,                      -- bcrypt of the submitter PIN (web form path)
    manager_pin_hash              text,                      -- bcrypt for /diesel/dashboard access (set in Pass 2)
    variance_flag_threshold_pct   numeric(5,2) not null default 30.00,
    rolling_window_fills          int          not null default 10,
    min_fills_before_flagging     int          not null default 5,
    default_price_per_liter       numeric(6,3) not null default 4.50,    -- AED
    driver_fuzzy_match_threshold  numeric(3,2) not null default 0.85,    -- min name-similarity for auto-link
    plate_fuzzy_match_threshold   numeric(3,2) not null default 0.85,
    report_recipient_phone        text,                      -- where daily summaries go
    updated_at                    timestamptz  not null default now()
);

-- Backfill columns for pre-April-17 installs
alter table public.diesel_config add column if not exists default_price_per_liter      numeric(6,3) not null default 4.50;
alter table public.diesel_config add column if not exists driver_fuzzy_match_threshold numeric(3,2) not null default 0.85;
alter table public.diesel_config add column if not exists plate_fuzzy_match_threshold  numeric(3,2) not null default 0.85;
alter table public.diesel_config add column if not exists manager_pin_hash             text;

-- Seed a single config row if empty
insert into public.diesel_config (id)
select gen_random_uuid()
where not exists (select 1 from public.diesel_config);

-- ============================================================
-- RLS — lock everything down. Server-side only via service_role.
-- ============================================================
alter table public.diesel_trucks                enable row level security;
alter table public.diesel_drivers               enable row level security;
alter table public.diesel_fills                 enable row level security;
alter table public.diesel_audit_log             enable row level security;
alter table public.diesel_authorized_submitters enable row level security;
alter table public.diesel_config                enable row level security;

-- No policies = deny-all for anon + authenticated. service_role bypasses RLS.
-- If you later want in-browser read access (e.g. manager dashboard signed in),
-- add explicit SELECT policies keyed to a JWT claim.

-- ============================================================
-- HELPER VIEW: fleet rolling average (last 30 days)
-- ============================================================
create or replace view public.v_diesel_fleet_avg_30d as
select
    round(avg(liters_per_100km)::numeric, 2) as fleet_avg_l100,
    count(*)                                  as sample_size,
    min(logged_at)                            as window_start,
    max(logged_at)                            as window_end
from public.diesel_fills
where liters_per_100km is not null
  and logged_at > now() - interval '30 days';

-- ============================================================
-- HELPER VIEW: per-truck latest fill + rolling stats
-- ============================================================
create or replace view public.v_diesel_truck_stats as
select
    t.id                                      as truck_id,
    t.plate_number,
    t.plate_display,
    t.nickname,
    t.active,
    t.needs_review,
    count(f.id)                               as total_fills,
    max(f.logged_at)                          as last_fill_at,
    round(avg(f.liters_per_100km)::numeric,2) as avg_l100_alltime,
    (
      select round(avg(sub.liters_per_100km)::numeric, 2)
      from (
        select liters_per_100km
        from public.diesel_fills f2
        where f2.truck_id = t.id and f2.liters_per_100km is not null
        order by logged_at desc
        limit 10
      ) sub
    )                                         as avg_l100_last10,
    sum(case when f.flagged then 1 else 0 end) as flag_count,
    sum(f.liters_filled)                      as total_liters,
    sum(f.cost_aed)                           as total_cost_aed
from public.diesel_trucks t
left join public.diesel_fills f on f.truck_id = t.id
group by t.id;

-- ============================================================
-- HELPER VIEW: per-driver stats (across any truck they've driven)
-- ============================================================
create or replace view public.v_diesel_driver_stats as
select
    d.id                                      as driver_id,
    d.full_name,
    d.name_normalized,
    d.nickname,
    d.active,
    d.needs_review,
    count(f.id)                               as total_fills,
    max(f.logged_at)                          as last_fill_at,
    round(avg(f.liters_per_100km)::numeric,2) as avg_l100_alltime,
    (
      select round(avg(sub.liters_per_100km)::numeric, 2)
      from (
        select liters_per_100km
        from public.diesel_fills f2
        where f2.driver_id = d.id and f2.liters_per_100km is not null
        order by logged_at desc
        limit 10
      ) sub
    )                                         as avg_l100_last10,
    sum(case when f.flagged then 1 else 0 end) as flag_count,
    sum(f.liters_filled)                      as total_liters,
    sum(f.cost_aed)                           as total_cost_aed
from public.diesel_drivers d
left join public.diesel_fills f on f.driver_id = d.id
group by d.id;

-- ============================================================
-- NAME NORMALIZATION HELPER (used by API + for unique lookup)
-- ============================================================
-- Immutable so it can be used in functional indexes later if needed.
create or replace function public.diesel_normalize_name(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           lower(trim(coalesce(raw, ''))),
           '[^a-z0-9 ]+', '', 'g'
         );
$$;

-- ============================================================
-- FOLLOW-UP STEPS (done manually in Supabase dashboard):
--   1. Set diesel_config.submit_pin_hash (bcrypt of chosen PIN). See DIESEL-DEPLOY-STEPS.md.
--   2. (Optional) Seed diesel_trucks with known plates; otherwise they auto-create.
--   3. (Optional) Seed diesel_drivers with roster; otherwise they auto-create from license OCR.
--   4. (Optional) Seed diesel_authorized_submitters with diesel guy's phone.
--   5. (Optional) Update diesel_config.default_price_per_liter if Dubai Diesel rate changes.
--   6. Pass 2 only: configure Google Sheets service-account env vars on Vercel.
-- ============================================================
