import { describe, it, expect } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  // Each test uses a unique key to avoid cross-test interference
  const uniqueKey = () => `test-${Date.now()}-${Math.random()}`;

  it('allows requests within the limit', () => {
    const key = uniqueKey();
    const r1 = rateLimit(key, 3, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit(key, 3, 60_000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit(key, 3, 60_000);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests exceeding the limit', () => {
    const key = uniqueKey();
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);

    const r3 = rateLimit(key, 2, 60_000);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('resets after the window expires', async () => {
    const key = uniqueKey();
    // Use a very short window
    rateLimit(key, 1, 50);
    const blocked = rateLimit(key, 1, 50);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    const reset = rateLimit(key, 1, 50);
    expect(reset.allowed).toBe(true);
  });

  it('isolates different keys', () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();

    rateLimit(key1, 1, 60_000);
    const blocked = rateLimit(key1, 1, 60_000);
    expect(blocked.allowed).toBe(false);

    // Different key should still be allowed
    const other = rateLimit(key2, 1, 60_000);
    expect(other.allowed).toBe(true);
  });
});
