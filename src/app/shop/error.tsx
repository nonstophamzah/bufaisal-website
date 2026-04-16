'use client';

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-4xl mb-4">Shop Error</h1>
        <p className="text-gray-600 mb-6">
          {error.message || 'Could not load shop items. Please try again.'}
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full bg-black text-white px-6 py-3 rounded-lg font-heading text-lg hover:bg-gray-800 transition-colors"
          >
            TRY AGAIN
          </button>
          <a
            href="/"
            className="block w-full bg-gray-200 text-black px-6 py-3 rounded-lg font-heading text-lg hover:bg-gray-300 transition-colors"
          >
            GO HOME
          </a>
        </div>
      </div>
    </div>
  );
}
