'use client';

import Link from 'next/link';
import { Home } from 'lucide-react';

export function AdminLogin({
  pin,
  setPin,
  loginError,
  loginLoading,
  onLogin,
  onKeyDown,
}: {
  pin: string;
  setPin: (value: string) => void;
  loginError: string;
  loginLoading: boolean;
  onLogin: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="relative pt-20 pb-16 flex items-center justify-center min-h-screen bg-white">
      {/* Home chip */}
      <Link
        href="/"
        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-bold active:scale-95 min-h-[40px]"
      >
        <Home size={14} /> HOME
      </Link>

      <div className="max-w-sm w-full mx-4">
        <div className="text-center mb-4">
          <span className="font-heading text-yellow text-xl tracking-widest">BU FAISAL</span>
        </div>
        <h1 className="font-heading text-4xl text-center mb-2">
          ADMIN <span className="text-yellow">PANEL</span>
        </h1>
        <p className="text-muted text-center mb-8 text-sm">
          Enter admin PIN to continue
        </p>
        <div className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={onKeyDown}
            placeholder="Enter PIN"
            className="w-full text-center text-2xl tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
          />
          <button
            onClick={onLogin}
            disabled={loginLoading}
            className="w-full bg-yellow text-black font-semibold py-3 rounded-xl hover:bg-yellow/90 transition-colors disabled:opacity-50"
          >
            {loginLoading ? 'Checking...' : 'Login'}
          </button>
          {loginError && (
            <p className="text-red-500 text-sm text-center">{loginError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
