'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Worker { id: string; name: string; role: string; }

export default function ManagerLoginPage() {
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Worker | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('app_manager_code')) {
      router.replace('/appliances/manager-gate');
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('appliance_workers')
        .select('id, name, role')
        .eq('role', 'manager')
        .order('name');
      setWorkers(data || []);
      setLoading(false);
    })();
  }, [router]);

  const handleConfirm = (w: Worker) => {
    sessionStorage.setItem('app_worker', JSON.stringify({ name: w.name, role: 'manager' }));
    router.push('/appliances/manager');
  };

  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)] flex flex-col">
      <button
        onClick={() => router.push('/appliances/manager-gate')}
        className="flex items-center gap-1 text-gray-500 mb-6"
      >
        <ArrowLeft size={20} /> Back
      </button>

      <h1 className="font-heading text-3xl text-center mb-8">SELECT MANAGER</h1>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3 max-w-sm mx-auto w-full">
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => setConfirm(w)}
              className="w-full py-6 bg-white border-2 border-gray-200 rounded-2xl font-heading text-3xl active:scale-95 transition-transform hover:border-yellow"
            >
              {w.name.toUpperCase()}
            </button>
          ))}
        </div>
      )}

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
