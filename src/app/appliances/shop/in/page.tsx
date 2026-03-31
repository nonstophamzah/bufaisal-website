'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CameraCapture from '../../components/Camera';
import SuccessFlash from '../../components/SuccessFlash';
import ErrorFlash from '../../components/ErrorFlash';

type Screen = 'details' | 'photo' | 'confirm';

const SHOPS = ['A', 'B', 'C', 'D', 'E'];
const PRODUCTS = ['Fridge', 'Washer', 'Oven', 'Microwave', 'AC / Cooler', 'Other'];
const BRANDS = ['Samsung', 'LG', 'Bosch', 'Whirlpool', 'Midea', 'Other'];
const STATUSES = [
  { value: 'Working', color: 'bg-green-500 text-white' },
  { value: 'Not Working', color: 'bg-orange-500 text-white' },
  { value: 'Scrap', color: 'bg-red-500 text-white' },
];
const PROBLEMS = ['No power', 'Not cooling', 'Leaking', 'Part missing', 'Other'];

export default function ShopInPage() {
  const router = useRouter();
  const [worker, setWorker] = useState('');
  const [screen, setScreen] = useState<Screen>('details');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form
  const [shop, setShop] = useState('');
  const [product, setProduct] = useState('');
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [barcode, setBarcode] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    setWorker(JSON.parse(w).name);
  }, [router]);

  const toggleProblem = (p: string) => {
    setProblems((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const isValid = shop && product && brand && status && barcode.trim();

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.from('appliance_items').insert({
      barcode: barcode.trim(),
      product_type: product,
      brand,
      status,
      problems: status === 'Not Working' ? problems : [],
      shop,
      photo_url: photoUrl || null,
      needs_jurf: status === 'Not Working',
      date_received: new Date().toISOString().split('T')[0],
      created_by: worker,
      approval_status: 'pending',
    });

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowSuccess(true);
  }, [barcode, product, brand, status, problems, shop, photoUrl, worker]);

  const reset = () => {
    setScreen('details');
    setShop('');
    setProduct('');
    setBrand('');
    setStatus('');
    setProblems([]);
    setBarcode('');
    setPhotoUrl('');
    setShowSuccess(false);
    setErrorMsg('');
  };

  if (!worker) return null;

  if (showSuccess) {
    return (
      <SuccessFlash
        message="Item logged!"
        onDone={() => { reset(); router.push('/appliances/shop'); }}
      />
    );
  }

  if (errorMsg) {
    return <ErrorFlash message={errorMsg} onRetry={() => setErrorMsg('')} />;
  }

  // ── SCREEN 2: Photo ──
  if (screen === 'photo') {
    return (
      <CameraCapture
        onDone={(url) => { setPhotoUrl(url); setScreen('confirm'); }}
        onBack={() => setScreen('details')}
      />
    );
  }

  // ── SCREEN 3: Confirm ──
  if (screen === 'confirm') {
    return (
      <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
        <button onClick={() => setScreen('photo')} className="flex items-center gap-1 text-gray-500 mb-4">
          <ArrowLeft size={20} /> Back
        </button>

        <h1 className="font-heading text-3xl mb-4">CONFIRM</h1>

        {photoUrl && (
          <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-200 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Item" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="space-y-2 mb-6">
          {[
            ['Shop', shop],
            ['Product', product],
            ['Brand', brand],
            ['Status', status],
            ['Problems', status === 'Not Working' ? problems.join(', ') || '—' : '—'],
            ['Barcode', barcode],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-semibold">{val}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full py-5 rounded-2xl bg-green-500 text-white font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
        >
          {saving ? <Loader2 size={24} className="animate-spin" /> : <Check size={24} strokeWidth={3} />}
          CONFIRM
        </button>
      </div>
    );
  }

  // ── SCREEN 1: Details ──
  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
      <button onClick={() => router.push('/appliances/shop')} className="flex items-center gap-1 text-gray-500 mb-4">
        <ArrowLeft size={20} /> Back
      </button>

      <h1 className="font-heading text-3xl mb-6">LOG IN — <span className="text-green-500">NEW ITEM</span></h1>

      {/* Shop */}
      <p className="font-bold text-sm mb-2">SHOP</p>
      <div className="grid grid-cols-5 gap-2 mb-5">
        {SHOPS.map((s) => (
          <button
            key={s}
            onClick={() => setShop(s)}
            className={`py-4 rounded-xl font-heading text-xl active:scale-95 transition-all ${
              shop === s ? 'bg-black text-yellow ring-2 ring-yellow' : 'bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Product */}
      <p className="font-bold text-sm mb-2">PRODUCT</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {PRODUCTS.map((p) => (
          <button
            key={p}
            onClick={() => setProduct(p)}
            className={`py-3.5 px-2 rounded-xl text-sm font-bold active:scale-95 transition-all ${
              product === p ? 'bg-black text-yellow ring-2 ring-yellow' : 'bg-gray-200'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Brand */}
      <p className="font-bold text-sm mb-2">BRAND</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {BRANDS.map((b) => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={`py-3.5 px-2 rounded-xl text-sm font-bold active:scale-95 transition-all ${
              brand === b ? 'bg-black text-yellow ring-2 ring-yellow' : 'bg-gray-200'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Status */}
      <p className="font-bold text-sm mb-2">STATUS</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`py-4 rounded-xl font-bold text-sm active:scale-95 transition-all ${
              status === s.value ? `${s.color} ring-2 ring-offset-1 ring-black` : 'bg-gray-200'
            }`}
          >
            {s.value}
          </button>
        ))}
      </div>

      {/* Problems (only if Not Working) */}
      {status === 'Not Working' && (
        <>
          <p className="font-bold text-sm mb-2">PROBLEMS <span className="text-gray-400 font-normal">(tap all that apply)</span></p>
          <div className="flex flex-wrap gap-2 mb-5">
            {PROBLEMS.map((p) => (
              <button
                key={p}
                onClick={() => toggleProblem(p)}
                className={`py-3 px-4 rounded-xl text-sm font-bold active:scale-95 transition-all ${
                  problems.includes(p) ? 'bg-orange-500 text-white ring-2 ring-orange-700' : 'bg-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Barcode */}
      <p className="font-bold text-sm mb-2">BARCODE</p>
      <input
        type="text"
        inputMode="text"
        value={barcode}
        onChange={(e) => setBarcode(e.target.value)}
        placeholder="Scan or type barcode"
        className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow mb-6"
      />

      {/* Next */}
      <button
        onClick={() => setScreen('photo')}
        disabled={!isValid}
        className="w-full py-5 rounded-2xl bg-black text-white font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30"
      >
        NEXT <ArrowRight size={22} />
      </button>
    </div>
  );
}
