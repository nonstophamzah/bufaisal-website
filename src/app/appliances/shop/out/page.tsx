'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Truck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  status: string | null;
  shop: string | null;
  photo_url: string | null;
}

export default function ShopOutPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    (async () => {
      const { data } = await supabase
        .from('appliance_items')
        .select('id, barcode, product_type, brand, status, shop, photo_url')
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false });
      setItems((data || []) as Item[]);
      setLoading(false);
    })();
  }, [router]);

  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
      <button onClick={() => router.push('/appliances/shop')} className="flex items-center gap-1 text-gray-500 mb-6">
        <ArrowLeft size={20} /> Back
      </button>
      <h1 className="font-heading text-3xl mb-6">LOG OUT — <span className="text-orange-500">SEND</span></h1>

      <div className="space-y-4 mb-8">
        <button className="w-full py-8 rounded-2xl bg-orange-500 text-white flex flex-col items-center gap-2 active:scale-95">
          <Truck size={36} /><span className="font-heading text-2xl">SEND TO JURF</span>
        </button>
        <button className="w-full py-8 rounded-2xl bg-gray-500 text-white flex flex-col items-center gap-2 active:scale-95">
          <Trash2 size={36} /><span className="font-heading text-2xl">SCRAP</span>
        </button>
      </div>

      <h2 className="font-heading text-xl mb-3">APPROVED ITEMS ({items.length})</h2>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No approved items to log out</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 20).map((item) => (
            <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3">
              <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {item.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{item.product_type} {item.brand ? `— ${item.brand}` : ''}</p>
                <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
