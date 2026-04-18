'use client';

// /diesel — Portal selector. Two doors:
//   LOG FILL → /diesel/submit  (diesel guy's PIN + 4-photo flow)
//   MANAGER  → /diesel/dashboard (manager PIN + 6-tab dashboard)
//
// This page itself is not PIN-gated; both destinations gate independently.

import Link from 'next/link';
import { Fuel, Camera, LayoutDashboard, ArrowRight } from 'lucide-react';

export default function DieselPortal() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-black to-gray-950 text-white flex flex-col items-center px-5 pt-14 pb-10">
      {/* hero */}
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow to-yellow/70 flex items-center justify-center mb-5 shadow-[0_0_40px_-10px_rgba(250,204,21,0.45)]">
        <Fuel size={40} className="text-black" strokeWidth={2.5} />
      </div>
      <h1 className="font-heading text-5xl tracking-tight mb-1">
        BU FAISAL <span className="text-yellow">DIESEL</span>
      </h1>
      <p className="text-gray-400 text-sm mb-10">Fleet fuel tracker</p>

      {/* tiles */}
      <div className="w-full max-w-md space-y-3">
        <Link
          href="/diesel/submit"
          className="group flex items-center gap-4 bg-gray-950/80 border border-gray-800 hover:border-yellow rounded-2xl p-5 transition-all active:scale-[0.98]"
        >
          <div className="w-14 h-14 bg-yellow/10 group-hover:bg-yellow/20 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            <Camera size={26} className="text-yellow" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-2xl">LOG A FILL</h2>
            <p className="text-xs text-gray-500">4 photos · ~60 seconds</p>
          </div>
          <ArrowRight size={20} className="text-gray-600 group-hover:text-yellow transition-colors" />
        </Link>

        <Link
          href="/diesel/dashboard"
          className="group flex items-center gap-4 bg-gray-950/80 border border-gray-800 hover:border-yellow rounded-2xl p-5 transition-all active:scale-[0.98]"
        >
          <div className="w-14 h-14 bg-yellow/10 group-hover:bg-yellow/20 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            <LayoutDashboard size={26} className="text-yellow" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-2xl">MANAGER</h2>
            <p className="text-xs text-gray-500">Fleet stats, flags, trends</p>
          </div>
          <ArrowRight size={20} className="text-gray-600 group-hover:text-yellow transition-colors" />
        </Link>
      </div>

      <p className="text-[11px] text-gray-600 mt-10 text-center max-w-xs">
        Each door has its own PIN. Diesel guy uses the LOG door only.
      </p>
    </div>
  );
}
