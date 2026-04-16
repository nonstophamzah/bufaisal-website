import { NextRequest, NextResponse } from 'next/server';

/**
 * Global middleware for security and route protection.
 * Runs on every matched request before the route handler.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ── Block direct access to admin pages without referer from site ──
  // (Defense-in-depth — admin page also checks auth client-side)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    // Allow if coming from the site itself (has valid referer)
    const referer = request.headers.get('referer') || '';
    const isFromSite =
      referer.includes('bufaisal.ae') ||
      referer.includes('localhost:3000') ||
      referer === ''; // Direct navigation is OK (user typing URL)

    // We don't block — admin has its own PIN auth — but we add security headers
    if (!isFromSite) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
  }

  // ── Prevent search engines from indexing internal routes ──
  if (
    pathname.startsWith('/appliances') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/team') ||
    pathname.startsWith('/login')
  ) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // ── Block API abuse: reject requests with suspicious user agents ──
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
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|og-image.png|robots.txt|sitemap.xml).*)',
  ],
};
