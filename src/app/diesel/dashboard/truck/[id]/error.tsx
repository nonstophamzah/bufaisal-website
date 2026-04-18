'use client';

// Error boundary for /diesel/dashboard/truck/[id].
// React minifies runtime errors in production (e.g. error #418, #31, etc.) so
// we surface the full message + stack here so the next time something crashes
// we can diagnose in seconds rather than spelunk the source. Click "Try again"
// to retry the render after the underlying issue is fixed.

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

export default function TruckDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console so the full stack is available in browser devtools.
    // eslint-disable-next-line no-console
    console.error('TruckDetail render error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <header className="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-gray-800 -mx-4 px-4 py-3 mb-4">
        <Link href="/diesel/dashboard" className="inline-flex items-center gap-1 text-gray-400 text-sm">
          <ArrowLeft size={16} /> Dashboard
        </Link>
      </header>

      <div className="bg-red-950 border border-red-700 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2 text-red-300 font-heading">
          <AlertTriangle size={18} /> TRUCK DETAIL CRASHED
        </div>
        <p className="text-red-200 text-sm font-mono break-words">{error.message || 'Unknown error'}</p>
        {error.digest && (
          <p className="text-red-400 text-[11px] mt-2 font-mono">digest: {error.digest}</p>
        )}
        {error.stack && (
          <details className="mt-3">
            <summary className="text-red-300 text-xs cursor-pointer">stack trace</summary>
            <pre className="mt-2 text-[11px] text-red-200/80 whitespace-pre-wrap break-words font-mono leading-relaxed">
              {error.stack}
            </pre>
          </details>
        )}
      </div>

      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-yellow text-black font-bold text-sm flex items-center gap-2"
      >
        <RefreshCw size={14} /> Try again
      </button>
    </div>
  );
}
