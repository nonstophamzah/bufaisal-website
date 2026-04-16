'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-4xl mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="bg-black text-white px-6 py-3 rounded-lg font-heading text-lg hover:bg-gray-800 transition-colors"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
