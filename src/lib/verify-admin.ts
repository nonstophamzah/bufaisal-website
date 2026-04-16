import { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/admin-session';
import { verifyOrigin } from '@/lib/verify-origin';

/**
 * Verify an admin request using signed session token.
 * Checks both origin and the Authorization bearer token.
 * Returns the admin name if valid, null otherwise.
 */
export function verifyAdmin(request: NextRequest): string | null {
  if (!verifyOrigin(request)) return null;

  // Check for token in Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const name = verifySessionToken(token);
    if (name) return name;
  }

  return null;
}
