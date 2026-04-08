import { NextRequest } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://bufaisal.ae',
  'https://www.bufaisal.ae',
  'http://localhost:3000',
];

export function verifyOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  if (origin && ALLOWED_ORIGINS.includes(origin)) return true;
  if (referer && ALLOWED_ORIGINS.some((o) => referer.startsWith(o))) return true;

  return false;
}
