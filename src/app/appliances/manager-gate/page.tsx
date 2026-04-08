'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { checkManagerCode } from '@/lib/appliance-api';

export default function ManagerGatePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(false);

    const match = await checkManagerCode(code.trim());
    if (match) {
      sessionStorage.setItem('app_worker', JSON.stringify({ name: 'Humaan', role: 'manager' }));
      router.push('/appliances/manager');
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-[calc(100vh-56px)]">
      <button
        onClick={() => router.push('/appliances')}
        className="absolute top-20 left-4 flex items-center gap-1 text-gray-500"
      >
        <ArrowLeft size={20} /> Back
      </button>

      <h1 className="font-heading text-4xl mb-8">ENTER MANAGER CODE</h1>

      <input
        type="text"
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(false); }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Manager code"
        autoComplete="off"
        className={`w-full max-w-xs text-center text-2xl px-6 py-5 rounded-2xl border-2 focus:outline-none ${
          error ? 'border-red-500 animate-[shake_0.3s_ease-in-out]' : 'border-gray-300 focus:border-yellow'
        }`}
        autoFocus
      />

      {error && <p className="text-red-500 font-bold mt-3">Invalid code</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !code.trim()}
        className="w-full max-w-xs mt-6 py-4 rounded-2xl bg-black text-white font-heading text-2xl active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={22} className="animate-spin" />}
        ENTER
      </button>
    </div>
  );
}
