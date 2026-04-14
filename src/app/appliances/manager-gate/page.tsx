'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Delete, ArrowLeft } from 'lucide-react';
import { checkManagerCode } from '@/lib/appliance-api';

const PIN_LENGTH = 4;

export default function ManagerGatePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = useCallback(async (pin: string) => {
    if (!pin.trim() || loading) return;
    setLoading(true);
    setError(false);

    const match = await checkManagerCode(pin.trim());
    if (match) {
      sessionStorage.setItem('app_worker', JSON.stringify({ name: 'Humaan', role: 'manager' }));
      setSuccess(true);
      setTimeout(() => router.push('/appliances/manager'), 600);
    } else {
      setError(true);
      setTimeout(() => { setError(false); setCode(''); }, 800);
    }
    setLoading(false);
  }, [loading, router]);

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

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-[calc(100vh-56px)] bg-[#111] pb-16">
      {/* Brand */}
      <span className="font-heading text-yellow text-3xl tracking-widest mb-2">BU FAISAL</span>
      <p className="text-gray-500 text-sm mb-10">MANAGER ACCESS</p>

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
          onClick={() => router.push('/appliances')}
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
