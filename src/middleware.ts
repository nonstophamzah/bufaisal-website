import { NextRequest, NextResponse } from 'next/server';

// Routes that require admin authentication
const ADMIN_ROUTES = ['/admin'];

// Routes that require appliance entry code
const APPLIANCE_PROTECTED_ROUTES = [
  '/appliances/select',
  '/appliances/shop',
  '/appliances/jurf',
  '/appliances/cleaning',
  '/appliances/security',
  '/appliances/delivery',
  '/appliances/manager',
];

// Internal routes that should not be accessible to search engines
const INTERNAL_ROUTES = ['/team', '/admin', '/appliances', '/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ── Add X-Robots-Tag for internal routes ──
  if (INTERNAL_ROUTES.some(route => pathname.startsWith(route))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // ── Admin route protection ──
  if (ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  // ── Appliance routes: ensure they go through the gate ──
  if (APPLIANCE_PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  // ── Block direct access to API routes from non-allowed origins ──
  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/appliances')) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const allowedOrigins = [
      'https://bufaisal.ae',
      'https://www.bufaisal.ae',
      'http://localhost:3000',
    ];

    const isAllowed =
      (origin && allowedOrigins.includes(origin)) ||
      (referer && allowedOrigins.some(o => referer.startsWith(o)));

    if (!isAllowed && request.method !== 'GET') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // ── Block API abuse: reject requests with no user agent ──
  const ua = request.headers.get('user-agent') || '';
  if (pathname.startsWith('/api/') && !ua) {
    return NextResponse.json(
      { error: 'Bad request' },
      { status: 400 }
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Match admin, appliance, team, login, and API routes
    '/admin/:path*',
    '/appliances/:path*',
    '/team/:path*',
    '/login',
    '/api/:path*',
  ],
};
