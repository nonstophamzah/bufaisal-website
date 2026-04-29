// HMAC-signed shop session tokens for team upload portal.
// Mirrors admin-session.ts but carries shop_label and uses a longer TTL
// because workers stay logged in across a shift.

import crypto from 'crypto';

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('No session secret configured');
  return secret;
}

interface ShopSessionPayload {
  shop_label: string;
  exp: number;
}

export function createShopSessionToken(shopLabel: string): string {
  const payload: ShopSessionPayload = {
    shop_label: shopLabel,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${hmac}`;
}

export function verifyShopSessionToken(token: string): string | null {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const expectedHmac = crypto
      .createHmac('sha256', getSecret())
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedHmac);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload: ShopSessionPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString()
    );

    if (payload.exp < Date.now()) return null;
    return payload.shop_label || null;
  } catch {
    return null;
  }
}
