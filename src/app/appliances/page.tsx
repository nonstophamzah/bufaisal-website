'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users, Settings } from 'lucide-react';
import { checkEntryCode } from '@/lib/appliance-api';

export default function AppliancesCodePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(false);

    const match = await checkEntryCode(code.trim());
    if (match) {
      sessionStorage.setItem('app_code', 'ok');
      setAuthenticated(true);
    } else {
      setError(true);
    }
    setLoading(false);
  };

  // After entry code: show two paths
  if (authenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-[calc(100vh-56px)] gap-6 pb-16">
        <h1 className="font-heading text-3xl mb-4">SELECT PORTAL</h1>

        <button
          onClick={() => router.push('/appliances/select')}
          className="w-full max-w-sm py-10 rounded-3xl bg-yellow text-black flex flex-col items-center gap-3 active:scale-95 transition-transform"
        >
          <Users size={48} strokeWidth={2} />
          <span className="font-heading text-4xl">WORKERS</span>
          <span className="text-sm opacity-60">Shop, Jurf & Security teams</span>
        </button>

        <button
          onClick={() => router.push('/appliances/manager-gate')}
          className="w-full max-w-sm py-10 rounded-3xl bg-black text-white border-2 border-gray-700 flex flex-col items-center gap-3 active:scale-95 transition-transform"
        >
          <Settings size={48} strokeWidth={2} />
          <span className="font-heading text-3xl">HUMAAN (MANAGER)</span>
          <span className="text-sm text-gray-400">Dashboard & reports</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-[calc(100vh-56px)] pb-16">
      <h1 className="font-heading text-4xl mb-8">ENTER ACCESS CODE</h1>

      <input
        type="text"
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(false); }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Access code"
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
        className="w-full max-w-xs mt-6 py-4 rounded-2xl bg-yellow text-black font-heading text-2xl active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={22} className="animate-spin" />}
        ENTER
      </button>
    </div>
  );
}
