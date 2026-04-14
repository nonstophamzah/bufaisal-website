'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowRight } from 'lucide-react';

export default function ShopHomePage() {
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    setName(JSON.parse(w).name);
  }, [router]);

  if (!name) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 gap-6 pb-16">
      <p className="font-heading text-2xl text-gray-400">{name.toUpperCase()}</p>

      <button
        onClick={() => router.push('/appliances/shop/in')}
        className="w-full max-w-sm py-10 rounded-3xl bg-green-500 text-white flex flex-col items-center gap-2 active:scale-95 transition-transform"
      >
        <Plus size={48} strokeWidth={3} />
        <span className="font-heading text-4xl">LOG IN +</span>
      </button>

      <button
        onClick={() => router.push('/appliances/shop/out')}
        className="w-full max-w-sm py-10 rounded-3xl bg-orange-500 text-white flex flex-col items-center gap-2 active:scale-95 transition-transform"
      >
        <ArrowRight size={48} strokeWidth={3} />
        <span className="font-heading text-4xl">LOG OUT →</span>
      </button>
    </div>
  );
}
