'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, Camera } from 'lucide-react';
import { insertItem } from '@/lib/appliance-api';
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
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

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

  const handleBarcodeScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setScanning(true);
    setScanMsg('');

    try {
      // Compress
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = url; });
      const c = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > 800) { h = (h * 800) / w; w = 800; }
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const base64 = await new Promise<string>((res) => {
        c.toBlob((b) => {
          const reader = new FileReader();
          reader.onloadend = () => res((reader.result as string).split(',')[1]);
          reader.readAsDataURL(b!);
        }, 'image/jpeg', 0.7);
      });

      const resp = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          prompt: 'Read the barcode number from this label photo. Return JSON only: {"barcode": "the number or null"}',
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.text) {
        const match = data.text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.barcode && parsed.barcode !== 'null') {
            setBarcode(parsed.barcode);
            setScanMsg('');
          } else {
            setScanMsg('Could not read. Please type manually.');
          }
        } else {
          setScanMsg('Could not read. Please type manually.');
        }
      } else {
        setScanMsg(data.error || 'Scan failed. Please type manually.');
      }
    } catch {
      setScanMsg('Scan failed. Please type manually.');
    }
    setScanning(false);
  };

  const isValid = shop && product && brand && status && barcode.trim();

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setErrorMsg('');

    const result = await insertItem({
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

    if (result.error) {
      setErrorMsg(result.error);
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
      <div className="flex gap-2 mb-1">
        <input
          type="text"
          inputMode="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Type or scan barcode"
          className="flex-1 px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
        />
        <button
          type="button"
          onClick={() => scanInputRef.current?.click()}
          disabled={scanning}
          className="px-5 py-4 rounded-xl bg-black text-white font-bold text-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          {scanning ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
          {scanning ? 'Reading...' : 'SCAN'}
        </button>
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleBarcodeScan}
          className="hidden"
        />
      </div>
      {scanMsg && <p className="text-orange-500 text-sm font-bold mb-4">{scanMsg}</p>}
      {!scanMsg && <div className="mb-5" />}

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
