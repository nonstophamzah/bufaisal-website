'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getWorkers } from '@/lib/appliance-api';

interface Worker { id: string; name: string; role: string; tab: string; }

const TABS = ['SHOP', 'JURF', 'SECURITY'] as const;

const ROLE_ROUTES: Record<string, string> = {
  shop: '/appliances/shop',
  jurf: '/appliances/jurf',
  cleaning: '/appliances/cleaning',
  delivery: '/appliances/delivery',
  security: '/appliances/security',
  manager: '/appliances/manager',
};

export default function SelectWorkerPage() {
  const router = useRouter();
  const [tab, setTab] = useState<string>('SHOP');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Worker | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('app_code')) { router.replace('/appliances'); return; }
    (async () => {
      const data = await getWorkers();
      setWorkers(data as Worker[]);
      setLoading(false);
    })();
  }, [router]);

  const handleConfirm = (w: Worker) => {
    sessionStorage.setItem('app_worker', JSON.stringify({ name: w.name, role: w.role }));
    router.push(ROLE_ROUTES[w.role] || '/appliances/shop');
  };

  const filtered = workers.filter((w) => w.tab === tab);

  return (
    <div className="px-4 pt-4 pb-24 min-h-[calc(100vh-56px)] flex flex-col">
      {/* Tabs */}
      <div className="flex bg-gray-200 rounded-xl p-1 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 rounded-lg font-heading text-lg transition-colors ${
              tab === t ? 'bg-yellow text-black' : 'text-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Workers */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3 flex-1">
          {filtered.map((w) => (
            <button
              key={w.id}
              onClick={() => setConfirm(w)}
              className="w-full py-5 bg-white border-2 border-gray-200 rounded-2xl font-heading text-2xl active:scale-95 transition-transform hover:border-yellow"
            >
              {w.name.toUpperCase()}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-10">No workers in this tab.</p>
          )}
        </div>
      )}

      {/* Manager access is via /appliances → MANAGER button → manager-gate */}

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            <p className="text-lg text-gray-500 mb-2">Are you</p>
            <p className="font-heading text-4xl mb-8">{confirm.name.toUpperCase()}?</p>
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
