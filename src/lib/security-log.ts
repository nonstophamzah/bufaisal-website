// Server-side security event logging.
// All functions are fire-and-forget — they must never throw and never block.

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type Severity = 'info' | 'warn' | 'critical';

export interface SecurityEventInput {
  event_type: string;
  severity: Severity;
  ip?: string | null;
  user_name?: string | null;
  route?: string | null;
  details?: Record<string, unknown> | null;
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export async function logSecurityEvent(evt: SecurityEventInput): Promise<void> {
  try {
    await supabaseAdmin.from('security_events').insert({
      event_type: evt.event_type,
      severity: evt.severity,
      ip: evt.ip ?? null,
      user_name: evt.user_name ?? null,
      route: evt.route ?? null,
      details: evt.details ?? null,
    });
  } catch {
    // Logging must never break a request
  }
}

export async function logApiError(
  req: NextRequest,
  status: number,
  opts: {
    route: string;
    user_name?: string | null;
    duration_ms?: number;
    error_message?: string;
  }
): Promise<void> {
  if (status < 400 && (!opts.duration_ms || opts.duration_ms < 2000)) return;
  try {
    await supabaseAdmin.from('api_request_log').insert({
      route: opts.route,
      method: req.method,
      status_code: status,
      ip: getClientIp(req),
      user_name: opts.user_name ?? null,
      duration_ms: opts.duration_ms ?? null,
      error_message: opts.error_message ?? null,
    });
  } catch {
    // Logging must never break a request
  }
}

/**
 * Records a (user_name, ip) sighting via the record_admin_ip RPC.
 * Returns true if the pair is novel (never seen, or not seen in 30 days).
 * Caller is responsible for emitting a `new_admin_ip` security_event on true.
 */
export async function recordAdminIp(user_name: string, ip: string): Promise<boolean> {
  if (!user_name || !ip || ip === 'unknown') return false;
  try {
    const { data, error } = await supabaseAdmin.rpc('record_admin_ip', {
      p_user: user_name,
      p_ip: ip,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export function logOriginRejectionFor(req: NextRequest, route: string): void {
  void logSecurityEvent({
    event_type: 'origin_rejected',
    severity: 'warn',
    ip: getClientIp(req),
    route,
    details: {
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
    },
  });
}
