'use client';

import { Loader2 } from 'lucide-react';

interface SummaryRow {
  label: string;
  value: string | undefined | null;
}

export default function SummaryScreen({
  title,
  rows,
  photos,
  onConfirm,
  onBack,
  loading,
}: {
  title: string;
  rows: SummaryRow[];
  photos?: { label: string; url: string }[];
  onConfirm: () => void;
  onBack: () => void;
  loading?: boolean;
}) {
  return (
    <div className="min-h-screen bg-white px-4 pt-6 pb-8">
      <h1 className="font-heading text-3xl mb-6">{title}</h1>

      <div className="space-y-2 mb-6">
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <div key={r.label} className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">{r.label}</span>
              <span className="text-sm font-semibold text-right max-w-[60%]">{r.value}</span>
            </div>
          ))}
      </div>

      {photos && photos.filter((p) => p.url).length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          {photos
            .filter((p) => p.url)
            .map((p) => (
              <div key={p.label} className="text-center">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 mb-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                </div>
                <p className="text-[10px] text-gray-500">{p.label}</p>
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-xl bg-gray-200 font-bold text-lg active:scale-95 transition-transform"
        >
          BACK
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-4 rounded-xl bg-green-500 text-white font-bold text-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : null}
          CONFIRM
        </button>
      </div>
    </div>
  );
}
