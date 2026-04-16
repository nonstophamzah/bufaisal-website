'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-4xl text-yellow-400 mb-4">Admin Error</h1>
        <p className="text-gray-300 mb-6">
          {error.message || 'Something went wrong in the admin panel.'}
        </p>
        <button
          onClick={reset}
          className="bg-yellow-400 text-black px-6 py-3 rounded-lg font-heading text-lg hover:bg-yellow-300 transition-colors"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
