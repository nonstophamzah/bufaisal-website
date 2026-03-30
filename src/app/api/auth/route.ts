import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

// Admin PINs — server-side only, never sent to client
const ADMIN_PINS: Record<string, string> = {
  '0000': 'Admin',
  '3333': 'Humaan',
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  // Rate limit: 5 login attempts per minute per IP
  const { allowed } = rateLimit(`login-${ip}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 1 minute.' },
      { status: 429 }
    );
  }

  try {
    const { pin } = await request.json();

    if (!pin || typeof pin !== 'string' || pin.length !== 4) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
    }

    const name = ADMIN_PINS[pin];
    if (name) {
      return NextResponse.json({ name });
    }

    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
