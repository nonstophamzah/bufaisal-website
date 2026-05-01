import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createShopSessionToken } from '@/lib/shop-session';
import bcrypt from 'bcryptjs';
import { getClientIp, logSecurityEvent } from '@/lib/security-log';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit: 5 attempts per minute per IP
  const { allowed } = rateLimit(`shop-auth-${ip}`, 5, 60_000);
  if (!allowed) {
    void logSecurityEvent({
      event_type: 'rate_limit_hit',
      severity: 'warn',
      ip,
      route: '/api/shop-auth',
    });
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 1 minute.' },
      { status: 429 }
    );
  }

  try {
    const { shop_label, password } = await request.json();

    if (!shop_label || !password || typeof shop_label !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Missing shop_label or password' }, { status: 400 });
    }

    // Fetch the hash from the DB using service_role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('shop_passwords')
      .select('password_hash')
      .eq('shop_label', shop_label)
      .maybeSingle();

    if (error || !data?.password_hash) {
      void logSecurityEvent({
        event_type: 'failed_shop_login',
        severity: 'warn',
        ip,
        route: '/api/shop-auth',
        details: { shop_label, reason: 'no_record' },
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const match = await bcrypt.compare(password, data.password_hash);
    if (!match) {
      void logSecurityEvent({
        event_type: 'failed_shop_login',
        severity: 'warn',
        ip,
        route: '/api/shop-auth',
        details: { shop_label, reason: 'bad_password' },
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = createShopSessionToken(shop_label);
    void logSecurityEvent({
      event_type: 'shop_login_success',
      severity: 'info',
      ip,
      user_name: `shop:${shop_label}`,
      route: '/api/shop-auth',
    });
    return NextResponse.json({ success: true, token });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
