'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Truck, Trash2 } from 'lucide-react';

export default function ShopOutPage() {
  const router = useRouter();
  const [worker, setWorker] = useState<{ name: string } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('appliance_worker');
    if (!stored) { router.replace('/appliances'); return; }
    setWorker(JSON.parse(stored));
  }, [router]);

  if (!worker) return null;

  return (
    <div className="min-h-screen bg-white px-4 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.push('/appliances/shop')} className="p-1">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-2xl">
          OUT — <span className="text-orange-500">SEND</span>
        </h1>
      </div>

      <div className="space-y-4 max-w-lg mx-auto">
        <button
          onClick={() => alert('Jurf dispatch flow — coming soon')}
          className="w-full bg-orange-500 text-white rounded-2xl py-8 flex flex-col items-center gap-2 active:scale-95 transition-transform"
        >
          <Truck size={40} />
          <span className="font-heading text-3xl">SEND TO JURF</span>
          <span className="text-sm opacity-80">For repair / testing</span>
        </button>

        <button
          onClick={() => alert('Scrap flow — coming soon')}
          className="w-full bg-gray-500 text-white rounded-2xl py-8 flex flex-col items-center gap-2 active:scale-95 transition-transform"
        >
          <Trash2 size={40} />
          <span className="font-heading text-3xl">SCRAP</span>
          <span className="text-sm opacity-80">Request manager approval</span>
        </button>
      </div>
    </div>
  );
}
