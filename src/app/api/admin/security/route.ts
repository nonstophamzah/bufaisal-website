import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAdmin } from '@/lib/verify-admin';
import { logOriginRejectionFor } from '@/lib/security-log';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Severity = 'info' | 'warn' | 'critical';
type Alert = { rule: number; severity: Severity; message: string };

export async function GET(request: NextRequest) {
  const adminName = verifyAdmin(request);
  if (!adminName) {
    // verifyAdmin() also checks origin; if it failed, log the rejection
    logOriginRejectionFor(request, '/api/admin/security');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const since1h = new Date(now - HOUR_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();

  const [
    failedLogins24hRes,
    failedLogins1hRes,
    rateLimitHits1hRes,
    adminActivityRes,
    apiErrors24hRes,
    serverErrorsAuth24hRes,
    authTrend7dRes,
    newIpEvents24hRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('security_events')
      .select('ip, created_at')
      .in('event_type', ['failed_admin_login', 'failed_shop_login'])
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin
      .from('security_events')
      .select('ip')
      .in('event_type', ['failed_admin_login', 'failed_shop_login'])
      .gte('created_at', since1h),
    supabaseAdmin
      .from('security_events')
      .select('id')
      .eq('event_type', 'rate_limit_hit')
      .gte('created_at', since1h),
    supabaseAdmin
      .from('security_events')
      .select('id, event_type, severity, user_name, ip, route, details, created_at')
      .in('event_type', [
        'admin_login_success', 'shop_login_success', 'admin_action', 'new_admin_ip',
      ])
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('api_request_log')
      .select('status_code')
      .gte('created_at', since24h)
      .gte('status_code', 400),
    supabaseAdmin
      .from('api_request_log')
      .select('id, route')
      .gte('created_at', since24h)
      .gte('status_code', 500),
    supabaseAdmin
      .from('security_events')
      .select('event_type, created_at')
      .in('event_type', [
        'admin_login_success', 'failed_admin_login',
        'shop_login_success', 'failed_shop_login',
      ])
      .gte('created_at', since7d),
    supabaseAdmin
      .from('security_events')
      .select('id, user_name, ip, created_at')
      .eq('event_type', 'new_admin_ip')
      .gte('created_at', since24h)
      .order('created_at', { ascending: false }),
  ]);

  // ── Failed logins ──
  const failedLoginRows = failedLogins24hRes.data ?? [];
  const ipCounts: Record<string, number> = {};
  for (const r of failedLoginRows) {
    if (r.ip) ipCounts[r.ip] = (ipCounts[r.ip] || 0) + 1;
  }
  const topFailedIps = Object.entries(ipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ip, count]) => ({ ip, count }));

  // ── 1h failed-login-per-IP for rule #1 ──
  const ipCounts1h: Record<string, number> = {};
  for (const r of failedLogins1hRes.data ?? []) {
    if (r.ip) ipCounts1h[r.ip] = (ipCounts1h[r.ip] || 0) + 1;
  }
  const offendingIps = Object.entries(ipCounts1h)
    .filter(([, c]) => c >= 5)
    .map(([ip, count]) => ({ ip, count }));

  // ── API errors by status ──
  const errorsByStatus: Record<string, number> = {};
  for (const r of apiErrors24hRes.data ?? []) {
    const k = String(r.status_code);
    errorsByStatus[k] = (errorsByStatus[k] || 0) + 1;
  }

  // ── 7-day daily trend ──
  const trendBuckets: { date: string; success: number; failed: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(now - d * DAY_MS);
    dt.setUTCHours(0, 0, 0, 0);
    trendBuckets.push({ date: dt.toISOString().slice(0, 10), success: 0, failed: 0 });
  }
  for (const r of authTrend7dRes.data ?? []) {
    const day = (r.created_at as string).slice(0, 10);
    const bucket = trendBuckets.find((b) => b.date === day);
    if (!bucket) continue;
    if (r.event_type === 'failed_admin_login' || r.event_type === 'failed_shop_login') {
      bucket.failed++;
    } else {
      bucket.success++;
    }
  }

  // ── Critical alerts ──
  const alerts: Alert[] = [];

  // Rule 1: ≥5 failed logins from one IP in 1h → critical
  for (const o of offendingIps) {
    alerts.push({
      rule: 1,
      severity: 'critical',
      message: `${o.count} failed logins from ${o.ip} in the last hour`,
    });
  }
  // Rule 2: rate limit hit ≥3× in 1h → warn
  const rateLimitHits = (rateLimitHits1hRes.data ?? []).length;
  if (rateLimitHits >= 3) {
    alerts.push({
      rule: 2,
      severity: 'warn',
      message: `Auth rate limiter tripped ${rateLimitHits}× in the last hour`,
    });
  }
  // Rule 3: any 5xx on auth/admin routes in 24h → warn
  const serverErrorsAuth = (serverErrorsAuth24hRes.data ?? [])
    .filter((r) => /\/(auth|admin|shop-auth)/.test(r.route));
  if (serverErrorsAuth.length > 0) {
    alerts.push({
      rule: 3,
      severity: 'warn',
      message: `${serverErrorsAuth.length} server error${serverErrorsAuth.length === 1 ? '' : 's'} on auth/admin routes (24h)`,
    });
  }
  // Rule 5: new (user_name, ip) pair in 24h → warn (per event)
  for (const evt of newIpEvents24hRes.data ?? []) {
    alerts.push({
      rule: 5,
      severity: 'warn',
      message: `New IP for ${evt.user_name || 'admin'}: ${evt.ip} at ${new Date(evt.created_at).toLocaleString()}`,
    });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    alerts,
    failedLogins: { total24h: failedLoginRows.length, topIps: topFailedIps },
    adminActions: adminActivityRes.data ?? [],
    apiErrors: { total24h: (apiErrors24hRes.data ?? []).length, byStatus: errorsByStatus },
    trend: trendBuckets,
  });
}
