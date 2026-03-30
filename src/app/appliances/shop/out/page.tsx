'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Truck, Trash2 } from 'lucide-react';

export default function ShopOutPage() {
  const router = useRouter();
  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
      <button onClick={() => router.push('/appliances/shop')} className="flex items-center gap-1 text-gray-500 mb-6">
        <ArrowLeft size={20} /> Back
      </button>
      <h1 className="font-heading text-3xl mb-6">LOG OUT — <span className="text-orange-500">SEND</span></h1>
      <div className="space-y-4">
        <button className="w-full py-8 rounded-2xl bg-orange-500 text-white flex flex-col items-center gap-2 active:scale-95">
          <Truck size={36} /><span className="font-heading text-2xl">SEND TO JURF</span>
        </button>
        <button className="w-full py-8 rounded-2xl bg-gray-500 text-white flex flex-col items-center gap-2 active:scale-95">
          <Trash2 size={36} /><span className="font-heading text-2xl">SCRAP</span>
        </button>
      </div>
      <p className="text-center text-gray-400 text-sm mt-6">Coming soon</p>
    </div>
  );
}
