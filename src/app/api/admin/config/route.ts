import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/verify-admin';

export async function POST(request: NextRequest) {
  const admin = verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const { allowed } = rateLimit(`admin-config-${ip}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { action, ...body } = await request.json();

    // ── READ: Get all config ──
    if (action === 'get_config') {
      const { data, error } = await supabaseAdmin
        .from('website_config')
        .select('*')
        .order('config_key');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ config: data || [] });
    }

    // ── UPDATE: Save a config value ──
    if (action === 'update_config') {
      const { config_key, config_value } = body;
      if (!config_key) return NextResponse.json({ error: 'Missing config_key' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('website_config')
        .update({ config_value, updated_by: admin })
        .eq('config_key', config_key);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
