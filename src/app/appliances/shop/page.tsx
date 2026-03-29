'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, ArrowUpFromLine, LogOut } from 'lucide-react';

export default function ShopHomePage() {
  const [worker, setWorker] = useState<{ name: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem('appliance_worker');
    if (!stored) {
      router.replace('/appliances');
      return;
    }
    setWorker(JSON.parse(stored));
  }, [router]);

  if (!worker) return null;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col px-4 pt-8 pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl text-yellow">
            {worker.name.toUpperCase()}
          </h1>
          <p className="text-sm text-gray-400">Appliance Shop</p>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem('appliance_worker');
            router.replace('/appliances');
          }}
          className="text-gray-500 hover:text-white p-2"
        >
          <LogOut size={22} />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-6 justify-center max-w-lg mx-auto w-full">
        <button
          onClick={() => router.push('/appliances/shop/in')}
          className="w-full bg-green-500 text-white rounded-2xl py-10 flex flex-col items-center gap-3 active:scale-95 transition-transform"
        >
          <ArrowDownToLine size={48} />
          <span className="font-heading text-5xl">IN</span>
          <span className="text-sm opacity-80">Receive new appliance</span>
        </button>

        <button
          onClick={() => router.push('/appliances/shop/out')}
          className="w-full bg-orange-500 text-white rounded-2xl py-10 flex flex-col items-center gap-3 active:scale-95 transition-transform"
        >
          <ArrowUpFromLine size={48} />
          <span className="font-heading text-5xl">OUT</span>
          <span className="text-sm opacity-80">Send to Jurf or Scrap</span>
        </button>
      </div>
    </div>
  );
}
