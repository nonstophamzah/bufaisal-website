'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Truck } from 'lucide-react';

export default function DeliveryPage() {
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl">DELIVERY <span className="text-green-500">DRIVER</span></h1>
          <p className="text-sm text-gray-400">{worker.name}</p>
        </div>
        <button onClick={() => { sessionStorage.removeItem('appliance_worker'); router.replace('/appliances'); }} className="text-gray-400 p-2">
          <LogOut size={22} />
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Truck size={48} className="mb-4" />
        <p className="font-heading text-2xl">FARUK DELIVERY FLOW</p>
        <p className="text-sm mt-2">Photo → Barcode → Shop → Truck plate → Confirm</p>
        <p className="text-sm mt-1 text-green-500 font-bold">Coming soon</p>
      </div>
    </div>
  );
}
