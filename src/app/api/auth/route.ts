import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { rateLimit } from '@/lib/rate-limit';
import { createSessionToken } from '@/lib/admin-session';

// PIN-to-name mapping is stored as JSON in ADMIN_PIN_HASHES env var.
// Format: [{"hash":"$2a$10$...","name":"Admin"},{"hash":"$2a$10$...","name":"Humaan"}]
function getAdminPinEntries(): { hash: string; name: string }[] {
  const raw = process.env.ADMIN_PIN_HASHES;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

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

    if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 8) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
    }

    const entries = getAdminPinEntries();
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    }

    // Check each admin entry
    for (const entry of entries) {
      if (await bcrypt.compare(pin, entry.hash)) {
        const token = createSessionToken(entry.name);
        return NextResponse.json({ name: entry.name, token });
      }
    }

    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
