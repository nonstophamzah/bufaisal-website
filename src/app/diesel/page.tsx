'use client';

// Diesel Tracker — PIN gate.
// Mirrors the appliances entry-code pattern. Uses sessionStorage (clears on tab close).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Fuel } from 'lucide-react';
import { checkPin } from '@/lib/diesel-api';

const SESSION_KEY = 'diesel_pin_ok';

export default function DieselGate() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      router.replace('/diesel/submit');
    }
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const ok = await checkPin(pin);
      if (!ok) {
        setError('Wrong PIN');
        setPin('');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      router.replace('/diesel/submit');
    } catch {
      setError('Server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-full bg-yellow flex items-center justify-center mb-4">
        <Fuel size={32} className="text-black" />
      </div>
      <h1 className="font-heading text-4xl mb-2">DIESEL LOG</h1>
      <p className="text-gray-400 text-sm mb-8">Enter PIN to log a fill</p>

      <form onSubmit={submit} className="w-full max-w-xs">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          maxLength={10}
          placeholder="PIN"
          className="w-full text-center text-3xl tracking-[0.5em] font-heading py-5 rounded-2xl bg-gray-900 text-yellow placeholder-gray-700 border-2 border-gray-800 focus:border-yellow focus:outline-none"
        />
        {error && <p className="text-red-400 text-center text-sm mt-3">{error}</p>}
        <button
          type="submit"
          disabled={loading || pin.length < 4}
          className="w-full mt-4 py-5 rounded-2xl bg-yellow text-black font-heading text-2xl active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={24} className="animate-spin" /> : 'ENTER'}
        </button>
      </form>
    </div>
  );
}
