'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users, Settings, Delete, ArrowLeft, Home } from 'lucide-react';
import { checkEntryCode } from '@/lib/appliance-api';

const PIN_LENGTH = 4;

export default function AppliancesCodePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();

  const handleSubmit = useCallback(async (pin: string) => {
    if (!pin.trim() || loading) return;
    setLoading(true);
    setError(false);

    const match = await checkEntryCode(pin.trim());
    if (match) {
      sessionStorage.setItem('app_code', 'ok');
      setSuccess(true);
      setTimeout(() => setAuthenticated(true), 600);
    } else {
      setError(true);
      setTimeout(() => { setError(false); setCode(''); }, 800);
    }
    setLoading(false);
  }, [loading]);

  const handlePadPress = useCallback((digit: string) => {
    if (loading || success) return;
    setError(false);
    const next = code + digit;
    setCode(next);
    if (next.length >= PIN_LENGTH) {
      handleSubmit(next);
    }
  }, [code, loading, success, handleSubmit]);

  const handleBackspace = useCallback(() => {
    if (loading || success) return;
    setCode((prev) => prev.slice(0, -1));
    setError(false);
  }, [loading, success]);

  // ── Portal selection (after auth) ──
  if (authenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-[calc(100vh-56px)] bg-[#111] gap-5 pb-16">
        <span className="font-heading text-yellow text-2xl tracking-widest mb-2">BU FAISAL</span>
        <h1 className="font-heading text-white text-3xl mb-6">SELECT PORTAL</h1>

        <button
          onClick={() => router.push('/appliances/select')}
          className="w-full max-w-sm py-8 rounded-2xl bg-yellow text-black flex flex-col items-center gap-2 active:scale-95 transition-transform"
        >
          <Users size={40} strokeWidth={2} />
          <span className="font-heading text-3xl">WORKERS</span>
          <span className="text-sm opacity-60">Shop, Jurf & Security teams</span>
        </button>

        <button
          onClick={() => router.push('/appliances/manager-gate')}
          className="w-full max-w-sm py-8 rounded-2xl bg-[#1a1a1a] text-white border border-gray-700 flex flex-col items-center gap-2 active:scale-95 transition-transform"
        >
          <Settings size={40} strokeWidth={2} />
          <span className="font-heading text-2xl">MANAGER</span>
          <span className="text-sm text-gray-400">Dashboard & reports</span>
        </button>
      </div>
    );
  }

  // ── PIN Entry ──
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center px-6 min-h-[calc(100vh-56px)] bg-[#111] pb-16">
      {/* Home chip — always escape to marketplace */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold active:scale-95 transition-transform min-h-[40px]"
      >
        <Home size={14} /> HOME
      </button>

      {/* Brand */}
      <span className="font-heading text-yellow text-3xl tracking-widest mb-2">BU FAISAL</span>
      <p className="text-gray-500 text-sm mb-10">ENTER ACCESS CODE</p>

      {/* PIN dots */}
      <div className={`flex gap-4 mb-8 ${error ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all duration-150 ${
              success
                ? 'bg-green-400 scale-125'
                : i < code.length
                ? 'bg-yellow scale-110'
                : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      {/* Error text */}
      {error && (
        <p className="text-red-400 font-bold text-sm mb-4">Wrong code</p>
      )}

      {/* Loading */}
      {loading && (
        <Loader2 size={24} className="animate-spin text-yellow mb-4" />
      )}

      {/* Success flash */}
      {success && (
        <p className="text-green-400 font-bold text-sm mb-4">Access granted</p>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            onClick={() => handlePadPress(digit)}
            disabled={loading || success}
            className="h-[72px] rounded-2xl bg-[#1a1a1a] border border-gray-800 text-white font-heading text-2xl active:scale-90 active:bg-gray-700 transition-all disabled:opacity-40"
          >
            {digit}
          </button>
        ))}
        <button
          onClick={() => router.push('/')}
          className="h-[72px] rounded-2xl text-gray-500 flex items-center justify-center active:scale-90 transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <button
          onClick={() => handlePadPress('0')}
          disabled={loading || success}
          className="h-[72px] rounded-2xl bg-[#1a1a1a] border border-gray-800 text-white font-heading text-2xl active:scale-90 active:bg-gray-700 transition-all disabled:opacity-40"
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          disabled={loading || success || code.length === 0}
          className="h-[72px] rounded-2xl text-gray-500 flex items-center justify-center active:scale-90 transition-all disabled:opacity-20"
        >
          <Delete size={24} />
        </button>
      </div>
    </div>
  );
}
