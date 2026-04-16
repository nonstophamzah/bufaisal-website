import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function makeRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe('middleware', () => {
  it('adds noindex to /admin routes', () => {
    const res = middleware(makeRequest('/admin'));
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('adds noindex to /appliances routes', () => {
    const res = middleware(makeRequest('/appliances'));
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('adds noindex to /team routes', () => {
    const res = middleware(makeRequest('/team'));
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('does NOT add noindex to /shop routes', () => {
    const res = middleware(makeRequest('/shop', { 'user-agent': 'Mozilla' }));
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
  });

  it('does NOT add noindex to / (homepage)', () => {
    const res = middleware(makeRequest('/', { 'user-agent': 'Mozilla' }));
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
  });

  it('blocks API requests with no user-agent', () => {
    const res = middleware(makeRequest('/api/test'));
    expect(res.status).toBe(400);
  });

  it('allows API requests with user-agent', () => {
    const res = middleware(makeRequest('/api/test', { 'user-agent': 'Mozilla/5.0' }));
    expect(res.status).toBe(200);
  });
});
