import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(async (pin: string, hash: string) => {
      // Simulate: PIN "1234" matches the test hash
      return pin === '1234' && hash === '$2a$10$testhash';
    }),
  },
}));

// Mock rate-limit to always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));

describe('POST /api/auth', () => {
  beforeEach(() => {
    vi.resetModules();
    // Set up test PIN hashes
    process.env.ADMIN_PIN_HASHES = JSON.stringify([
      { hash: '$2a$10$testhash', name: 'TestAdmin' },
    ]);
  });

  async function callAuth(body: unknown) {
    const { POST } = await import('@/app/api/auth/route');
    const req = new NextRequest('http://localhost:3000/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('returns admin name for correct PIN', async () => {
    const res = await callAuth({ pin: '1234' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('TestAdmin');
  });

  it('rejects wrong PIN with 401', async () => {
    const res = await callAuth({ pin: '9999' });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Wrong PIN');
  });

  it('rejects too-short PIN with 400', async () => {
    const res = await callAuth({ pin: '12' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid PIN');
  });

  it('rejects missing PIN with 400', async () => {
    const res = await callAuth({});
    expect(res.status).toBe(400);
  });

  it('rejects non-string PIN with 400', async () => {
    const res = await callAuth({ pin: 1234 });
    expect(res.status).toBe(400);
  });

  it('returns 500 when ADMIN_PIN_HASHES not configured', async () => {
    delete process.env.ADMIN_PIN_HASHES;
    const res = await callAuth({ pin: '1234' });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Auth not configured');
  });

  it('rate limits excessive attempts', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    (rateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce({ allowed: false, remaining: 0 });

    const res = await callAuth({ pin: '1234' });
    expect(res.status).toBe(429);
  });
});
