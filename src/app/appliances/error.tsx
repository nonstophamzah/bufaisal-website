'use client';

export default function ApplianceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-3xl mb-4">Tracker Error</h1>
        <p className="text-gray-600 mb-6">
          {error.message || 'Something went wrong in the appliance tracker.'}
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full bg-black text-white px-6 py-3 rounded-lg font-heading text-lg hover:bg-gray-800 transition-colors"
          >
            TRY AGAIN
          </button>
          <button
            onClick={() => window.location.href = '/appliances'}
            className="w-full bg-gray-200 text-black px-6 py-3 rounded-lg font-heading text-lg hover:bg-gray-300 transition-colors"
          >
            BACK TO TRACKER
          </button>
        </div>
      </div>
    </div>
  );
}
