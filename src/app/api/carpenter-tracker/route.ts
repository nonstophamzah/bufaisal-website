import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/verify-origin';
import {
  getClientIp,
  logSecurityEvent,
  logApiError,
  logOriginRejectionFor,
} from '@/lib/security-log';

// Field whitelist for insert_item — anything else in body.item is dropped.
// Note: worker_name, shop, rate_at_log are derived SERVER-SIDE from the
// worker_id + item_type lookups, never trusted from the client.
const ALLOWED_INSERT_FIELDS = [
  'worker_id', 'item_type', 'job_type', 'before_photo_url', 'after_photo_url',
];

const VALID_JOB_TYPES = ['USED', 'NEW'] as const;
type JobType = (typeof VALID_JOB_TYPES)[number];
function isJobType(v: unknown): v is JobType {
  return typeof v === 'string' && (VALID_JOB_TYPES as readonly string[]).includes(v);
}

function sanitizeFields(obj: Record<string, unknown>, allowedKeys: string[]): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in obj) safe[key] = obj[key];
  }
  return safe;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (!verifyOrigin(request)) {
    logOriginRejectionFor(request, '/api/carpenter-tracker');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { allowed } = rateLimit(`carpenter-${ip}`, 30, 60_000);
  if (!allowed) {
    void logSecurityEvent({
      event_type: 'rate_limit_hit',
      severity: 'warn',
      ip,
      route: '/api/carpenter-tracker',
    });
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { action, ...body } = await request.json();

    // ── Config reads: code checks ────────────────────────────────────
    if (action === 'check_entry_code' || action === 'check_manager_code') {
      const { allowed: codeAllowed } = rateLimit(`carpenter-code-${ip}`, 5, 60_000);
      if (!codeAllowed) {
        void logSecurityEvent({
          event_type: 'rate_limit_hit',
          severity: 'warn',
          ip,
          route: '/api/carpenter-tracker',
          details: { sub: 'code-check' },
        });
        return NextResponse.json({ error: 'Too many attempts. Try again in 1 minute.' }, { status: 429 });
      }

      const configKey = action === 'check_entry_code' ? 'entry_code' : 'manager_code';
      const { data } = await supabaseAdmin
        .from('carpenter_config')
        .select('value')
        .eq('key', configKey)
        .maybeSingle();

      if (!data?.value || !body.code) {
        return NextResponse.json({ match: false });
      }

      let match = false;
      if (data.value.startsWith('$2a$') || data.value.startsWith('$2b$')) {
        match = await bcrypt.compare(String(body.code), data.value);
      } else {
        match = data.value === body.code;
      }
      if (!match) {
        void logSecurityEvent({
          event_type: 'failed_code_check',
          severity: 'warn',
          ip,
          route: '/api/carpenter-tracker',
          details: { which: configKey },
        });
      }
      return NextResponse.json({ match });
    }

    // ── Workers (active only) ────────────────────────────────────────
    if (action === 'get_workers') {
      const { data, error } = await supabaseAdmin
        .from('carpenter_workers')
        .select('id, name, shop, active')
        .eq('active', true)
        .order('shop')
        .order('name');
      if (error) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ workers: data || [] });
    }

    // ── Rates (active only — for the log/page tap tiles) ────────────
    if (action === 'get_rates') {
      let query = supabaseAdmin
        .from('carpenter_rates')
        .select('id, item_type, job_type, rate_aed, active, updated_at')
        .eq('active', true)
        .order('job_type')
        .order('item_type');
      if (isJobType(body.job_type)) {
        query = query.eq('job_type', body.job_type);
      }
      const { data, error } = await query;
      if (error) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ rates: data || [] });
    }

    // ── All rates (manager dashboard, including inactive) ────────────
    if (action === 'get_all_rates') {
      const { data, error } = await supabaseAdmin
        .from('carpenter_rates')
        .select('id, item_type, job_type, rate_aed, active, updated_at')
        .order('job_type')
        .order('item_type');
      if (error) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ rates: data || [] });
    }

    // ── Insert item (server snapshots rate_at_log + worker_name/shop) ─
    if (action === 'insert_item') {
      const safe = sanitizeFields(body.item || {}, ALLOWED_INSERT_FIELDS);
      const worker_id = safe.worker_id as string | undefined;
      const item_type = safe.item_type as string | undefined;
      const job_type_raw = safe.job_type;
      const before_photo_url = safe.before_photo_url as string | undefined;
      const after_photo_url = safe.after_photo_url as string | undefined;

      if (!worker_id || typeof worker_id !== 'string') {
        return NextResponse.json({ error: 'Missing worker_id' }, { status: 400 });
      }
      if (!item_type || typeof item_type !== 'string') {
        return NextResponse.json({ error: 'Missing item_type' }, { status: 400 });
      }
      if (!isJobType(job_type_raw)) {
        return NextResponse.json({ error: 'Missing or invalid job_type' }, { status: 400 });
      }
      const job_type: JobType = job_type_raw;
      if (!before_photo_url || typeof before_photo_url !== 'string' || !before_photo_url.startsWith('http')) {
        return NextResponse.json({ error: 'Before photo is required' }, { status: 400 });
      }
      if (!after_photo_url || typeof after_photo_url !== 'string' || !after_photo_url.startsWith('http')) {
        return NextResponse.json({ error: 'After photo is required' }, { status: 400 });
      }

      // Look up worker (authoritative — name/shop come from DB, not client)
      const { data: worker, error: wErr } = await supabaseAdmin
        .from('carpenter_workers')
        .select('id, name, shop, active')
        .eq('id', worker_id)
        .maybeSingle();
      if (wErr) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: wErr.message });
        return NextResponse.json({ error: wErr.message }, { status: 500 });
      }
      if (!worker) return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
      if (!worker.active) return NextResponse.json({ error: 'Worker is inactive' }, { status: 403 });

      // Look up current rate by (job_type, item_type) — snapshot into rate_at_log
      const { data: rate, error: rErr } = await supabaseAdmin
        .from('carpenter_rates')
        .select('rate_aed, active')
        .eq('job_type', job_type)
        .eq('item_type', item_type)
        .maybeSingle();
      if (rErr) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: rErr.message });
        return NextResponse.json({ error: rErr.message }, { status: 500 });
      }
      if (!rate) return NextResponse.json({ error: 'Item type not found' }, { status: 404 });
      if (!rate.active) return NextResponse.json({ error: 'Item type is inactive' }, { status: 403 });

      const { error: insErr } = await supabaseAdmin.from('carpenter_items').insert({
        worker_id: worker.id,
        worker_name: worker.name,
        shop: worker.shop,
        item_type,
        job_type,
        rate_at_log: rate.rate_aed,
        before_photo_url,
        after_photo_url,
      });
      if (insErr) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: insErr.message });
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }

      void logSecurityEvent({
        event_type: 'admin_action',
        severity: 'info',
        ip,
        user_name: worker.name,
        route: '/api/carpenter-tracker',
        details: { action: 'insert_item', item_type, job_type, shop: worker.shop },
      });

      return NextResponse.json({ success: true });
    }

    // ── Items list (manager dashboard) ───────────────────────────────
    if (action === 'get_items') {
      const limit = Math.min(Number(body.limit) || 500, 1000);
      let query = supabaseAdmin
        .from('carpenter_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (body.since && typeof body.since === 'string') {
        query = query.gte('created_at', body.since);
      }
      const { data, error } = await query;
      if (error) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ items: data || [] });
    }

    // ── Update a single rate (manager only) ──────────────────────────
    if (action === 'update_rate') {
      const item_type = body.item_type;
      const job_type = body.job_type;
      const rate_aed = body.rate_aed;
      if (!item_type || typeof item_type !== 'string') {
        return NextResponse.json({ error: 'Missing item_type' }, { status: 400 });
      }
      if (!isJobType(job_type)) {
        return NextResponse.json({ error: 'Missing or invalid job_type' }, { status: 400 });
      }
      if (!Number.isInteger(rate_aed) || (rate_aed as number) < 0 || (rate_aed as number) > 10000) {
        return NextResponse.json({ error: 'Invalid rate' }, { status: 400 });
      }
      const { error } = await supabaseAdmin
        .from('carpenter_rates')
        .update({ rate_aed })
        .eq('job_type', job_type)
        .eq('item_type', item_type);
      if (error) {
        void logApiError(request, 500, { route: '/api/carpenter-tracker', error_message: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      void logSecurityEvent({
        event_type: 'admin_action',
        severity: 'info',
        ip,
        route: '/api/carpenter-tracker',
        details: { action: 'update_rate', item_type, job_type, rate_aed },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    void logApiError(request, 500, {
      route: '/api/carpenter-tracker',
      error_message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
