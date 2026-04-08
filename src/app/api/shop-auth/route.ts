import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  // Rate limit: 5 attempts per minute per IP
  const { allowed } = rateLimit(`shop-auth-${ip}`, 5, 60_000);
  if (!allowed) {
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
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const match = await bcrypt.compare(password, data.password_hash);
    if (!match) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
