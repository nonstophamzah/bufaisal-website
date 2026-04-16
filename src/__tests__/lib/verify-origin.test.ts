import { describe, it, expect } from 'vitest';
import { verifyOrigin } from '@/lib/verify-origin';
import { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', { headers });
}

describe('verifyOrigin', () => {
  it('allows requests from bufaisal.ae origin', () => {
    const req = makeRequest({ origin: 'https://bufaisal.ae' });
    expect(verifyOrigin(req)).toBe(true);
  });

  it('allows requests from www.bufaisal.ae origin', () => {
    const req = makeRequest({ origin: 'https://www.bufaisal.ae' });
    expect(verifyOrigin(req)).toBe(true);
  });

  it('allows requests from localhost:3000', () => {
    const req = makeRequest({ origin: 'http://localhost:3000' });
    expect(verifyOrigin(req)).toBe(true);
  });

  it('allows requests with valid referer (no origin)', () => {
    const req = makeRequest({ referer: 'https://bufaisal.ae/admin' });
    expect(verifyOrigin(req)).toBe(true);
  });

  it('blocks requests from unknown origins', () => {
    const req = makeRequest({ origin: 'https://evil.com' });
    expect(verifyOrigin(req)).toBe(false);
  });

  it('blocks requests with no origin or referer', () => {
    const req = makeRequest({});
    expect(verifyOrigin(req)).toBe(false);
  });

  it('blocks requests with spoofed referer', () => {
    const req = makeRequest({ referer: 'https://evil.com/bufaisal.ae' });
    expect(verifyOrigin(req)).toBe(false);
  });
});
