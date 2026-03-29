'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import WorkerLogin from '../components/WorkerLogin';

export default function ManagerPage() {
  const router = useRouter();
  const [worker, setWorker] = useState<{ name: string } | null>(null);

  if (!worker) {
    return (
      <div className="min-h-screen bg-black text-white px-4 pt-8 pb-8">
        <button onClick={() => router.push('/appliances')} className="text-gray-400 mb-6 flex items-center gap-2">
          <ArrowLeft size={20} /> Back
        </button>
        <h1 className="font-heading text-3xl text-yellow mb-6 text-center">MANAGER LOGIN</h1>
        <WorkerLogin role="manager" onLogin={(w) => setWorker(w)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 pt-6 pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl">MANAGER <span className="text-yellow">DASHBOARD</span></h1>
          <p className="text-sm text-gray-400">{worker.name}</p>
        </div>
        <button onClick={() => setWorker(null)} className="text-sm text-gray-400">
          Logout
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Scrap Approval', color: 'bg-red-50 border-red-200 text-red-700' },
          { label: 'Shop Delivery', color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Violations', color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'Returns', color: 'bg-blue-50 border-blue-200 text-blue-700' },
        ].map((card) => (
          <div
            key={card.label}
            className={`border-2 rounded-xl p-6 text-center ${card.color}`}
          >
            <p className="font-heading text-lg">{card.label.toUpperCase()}</p>
            <p className="text-xs mt-1 opacity-60">Coming soon</p>
          </div>
        ))}
      </div>
    </div>
  );
}
