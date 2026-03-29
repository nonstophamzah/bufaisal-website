'use client';

import { useEffect } from 'react';
import { Check } from 'lucide-react';

export default function SuccessFlash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100] bg-green-500 flex flex-col items-center justify-center text-white">
      <div className="w-24 h-24 rounded-full border-4 border-white flex items-center justify-center mb-4">
        <Check size={56} strokeWidth={3} />
      </div>
      <p className="font-heading text-4xl">DONE!</p>
    </div>
  );
}
