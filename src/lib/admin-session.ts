// Server-side admin session management using HMAC-signed tokens
// No external dependencies — uses Node.js built-in crypto

import crypto from 'crypto';

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getSecret(): string {
  // Use a dedicated secret if available, otherwise derive from service role key
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('No session secret configured');
  return secret;
}

interface SessionPayload {
  name: string;
  exp: number; // expiry timestamp in ms
}

/**
 * Create a signed session token after successful PIN login.
 * Format: base64(payload).base64(hmac)
 */
export function createSessionToken(adminName: string): string {
  const payload: SessionPayload = {
    name: adminName,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * Verify a session token and return the admin name if valid.
 * Returns null if invalid or expired.
 */
export function verifySessionToken(token: string): string | null {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    // Verify HMAC
    const expectedHmac = crypto
      .createHmac('sha256', getSecret())
      .update(payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
      return null;
    }

    // Decode and check expiry
    const payload: SessionPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString()
    );

    if (payload.exp < Date.now()) return null;

    return payload.name || null;
  } catch {
    return null;
  }
}
