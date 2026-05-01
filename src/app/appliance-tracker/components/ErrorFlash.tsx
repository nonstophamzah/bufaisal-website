'use client';

import { X } from 'lucide-react';

export default function ErrorFlash({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-red-500 flex flex-col items-center justify-center text-white px-6">
      <div className="w-24 h-24 rounded-full border-4 border-white flex items-center justify-center mb-4">
        <X size={56} strokeWidth={3} />
      </div>
      <p className="font-heading text-3xl mb-2">ERROR</p>
      <p className="text-lg text-center mb-8 max-w-xs">{message}</p>
      <button onClick={onRetry} className="bg-white text-red-500 font-bold text-lg px-8 py-4 rounded-2xl active:scale-95">
        RETRY
      </button>
    </div>
  );
}
