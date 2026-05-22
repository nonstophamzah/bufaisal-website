'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getWorkers, type CarpenterWorker } from '@/lib/carpenter-tracker-api';

export default function SelectCarpenterPage() {
  const router = useRouter();
  const [workers, setWorkers] = useState<CarpenterWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<CarpenterWorker | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('carpenter_code')) {
      router.replace('/carpenter-tracker');
      return;
    }
    (async () => {
      const data = await getWorkers();
      setWorkers(data);
      setLoading(false);
    })();
  }, [router]);

  const handleConfirm = (w: CarpenterWorker) => {
    sessionStorage.setItem(
      'carpenter_worker',
      JSON.stringify({ id: w.id, name: w.name, shop: w.shop }),
    );
    router.push('/carpenter-tracker/log');
  };

  return (
    <div className="px-4 pt-4 pb-24 min-h-[calc(100vh-56px)] flex flex-col">
      <h1 className="font-heading text-3xl mb-6">SELECT CARPENTER</h1>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3 flex-1">
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => setConfirm(w)}
              className="w-full py-5 bg-white border-2 border-gray-200 rounded-2xl flex items-center justify-between px-5 active:scale-95 transition-transform hover:border-yellow"
            >
              <span className="font-heading text-2xl">{w.name.toUpperCase()}</span>
              <span className="font-heading text-xl text-gray-400">SHOP {w.shop}</span>
            </button>
          ))}
          {workers.length === 0 && (
            <p className="text-center text-gray-400 py-10">No carpenters available.</p>
          )}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            <p className="text-lg text-gray-500 mb-2">Are you</p>
            <p className="font-heading text-4xl mb-1">{confirm.name.toUpperCase()}</p>
            <p className="text-sm text-gray-400 mb-8">Shop {confirm.shop}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-4 rounded-2xl bg-gray-200 font-bold text-lg active:scale-95"
              >
                NO
              </button>
              <button
                onClick={() => handleConfirm(confirm)}
                className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-bold text-lg active:scale-95"
              >
                YES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
