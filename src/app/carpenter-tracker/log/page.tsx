'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, Camera as CameraIcon, RotateCcw } from 'lucide-react';
import CameraCapture from '@/app/appliances/components/Camera';
import SuccessFlash from '@/app/appliances/components/SuccessFlash';
import ErrorFlash from '@/app/appliances/components/ErrorFlash';
import { getRates, insertItem, type CarpenterRate } from '@/lib/carpenter-tracker-api';

type Screen = 'item' | 'photos' | 'confirm';
type Slot = 'before' | 'after';

interface WorkerSession {
  id: string;
  name: string;
  shop: string;
}

export default function CarpenterLogPage() {
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [screen, setScreen] = useState<Screen>('item');
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [rates, setRates] = useState<CarpenterRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);

  // Form
  const [itemType, setItemType] = useState('');
  const [beforeUrl, setBeforeUrl] = useState('');
  const [afterUrl, setAfterUrl] = useState('');

  useEffect(() => {
    const w = sessionStorage.getItem('carpenter_worker');
    if (!w) { router.replace('/carpenter-tracker'); return; }
    setWorker(JSON.parse(w));
  }, [router]);

  useEffect(() => {
    (async () => {
      const data = await getRates();
      setRates(data);
      setRatesLoading(false);
    })();
  }, []);

  const reset = useCallback(() => {
    setScreen('item');
    setActiveSlot(null);
    setItemType('');
    setBeforeUrl('');
    setAfterUrl('');
    setShowSuccess(false);
    setErrorMsg('');
  }, []);

  const currentRate = rates.find((r) => r.item_type === itemType)?.rate_aed ?? 0;

  const handleConfirm = useCallback(async () => {
    if (!worker) return;
    setSaving(true);
    setErrorMsg('');

    const result = await insertItem({
      worker_id: worker.id,
      item_type: itemType,
      before_photo_url: beforeUrl,
      after_photo_url: afterUrl,
    });

    if (result.error) {
      setErrorMsg(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowSuccess(true);
  }, [worker, itemType, beforeUrl, afterUrl]);

  if (!worker) return null;

  if (showSuccess) {
    return <SuccessFlash message="Item logged!" onDone={reset} />;
  }

  if (errorMsg) {
    return <ErrorFlash message={errorMsg} onRetry={() => setErrorMsg('')} />;
  }

  // ── Camera sub-screen for the active photo slot ──
  if (screen === 'photos' && activeSlot) {
    return (
      <CameraCapture
        allowGallery
        onDone={(url) => {
          if (activeSlot === 'before') setBeforeUrl(url);
          else setAfterUrl(url);
          setActiveSlot(null);
        }}
        onBack={() => setActiveSlot(null)}
      />
    );
  }

  // ── SCREEN 3: Confirm ──
  if (screen === 'confirm') {
    return (
      <div className="px-4 pt-4 pb-24 min-h-[calc(100vh-56px)] max-w-full overflow-x-hidden">
        <button
          onClick={() => setScreen('photos')}
          className="flex items-center gap-1 text-gray-500 mb-4 min-h-[48px]"
        >
          <ArrowLeft size={20} /> Back
        </button>

        <h1 className="font-heading text-3xl mb-4">CONFIRM</h1>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs text-gray-500 mb-1 font-bold">BEFORE</p>
            <div className="aspect-square rounded-xl overflow-hidden bg-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={beforeUrl} alt="Before" className="w-full h-full object-cover" />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1 font-bold">AFTER</p>
            <div className="aspect-square rounded-xl overflow-hidden bg-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={afterUrl} alt="After" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          {[
            ['Carpenter', worker.name],
            ['Shop', worker.shop],
            ['Item', itemType],
            ['Earned', `AED ${currentRate}`],
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

  // ── SCREEN 2: Photos (two slots) ──
  if (screen === 'photos') {
    const photosReady = beforeUrl && afterUrl;
    return (
      <div className="px-4 pt-4 pb-24 min-h-[calc(100vh-56px)] max-w-full overflow-x-hidden">
        <button
          onClick={() => setScreen('item')}
          className="flex items-center gap-1 text-gray-500 mb-4 min-h-[48px]"
        >
          <ArrowLeft size={20} /> Back
        </button>

        <h1 className="font-heading text-3xl mb-2">PHOTOS</h1>
        <p className="text-sm text-gray-500 mb-6">{itemType} · AED {currentRate}</p>

        <div className="space-y-4 mb-8">
          <PhotoSlot
            label="BEFORE"
            url={beforeUrl}
            onTap={() => setActiveSlot('before')}
          />
          <PhotoSlot
            label="AFTER"
            url={afterUrl}
            onTap={() => setActiveSlot('after')}
          />
        </div>

        <button
          onClick={() => photosReady && setScreen('confirm')}
          disabled={!photosReady}
          className={`w-full py-5 rounded-2xl bg-black text-white font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform ${!photosReady ? 'opacity-30' : ''}`}
        >
          NEXT <ArrowRight size={22} />
        </button>
      </div>
    );
  }

  // ── SCREEN 1: Item type ──
  return (
    <div className="px-4 pt-4 pb-44 min-h-[calc(100vh-56px)] max-w-full overflow-x-hidden">
      <div className="flex items-baseline justify-between mb-4">
        <p className="font-heading text-2xl text-gray-400">{worker.name.toUpperCase()}</p>
        <p className="font-heading text-base text-gray-400">SHOP {worker.shop}</p>
      </div>

      <h1 className="font-heading text-3xl mb-6">LOG ITEM — <span className="text-green-500">NEW</span></h1>

      {ratesLoading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rates.map((r) => {
            const selected = itemType === r.item_type;
            return (
              <button
                key={r.id}
                onClick={() => setItemType(r.item_type)}
                className={`py-5 px-3 rounded-xl active:scale-95 transition-all flex flex-col items-center gap-1 min-h-[88px] ${
                  selected ? 'bg-black ring-2 ring-yellow' : 'bg-gray-200'
                }`}
              >
                <span className={`font-heading text-base text-center leading-tight ${selected ? 'text-yellow' : ''}`}>
                  {r.item_type.toUpperCase()}
                </span>
                <span className={`text-xs font-bold ${selected ? 'text-yellow/80' : 'text-gray-600'}`}>
                  AED {r.rate_aed}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sticky bottom bar: picked item + NEXT (only when something is selected) */}
      {itemType && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-black border-t-2 border-yellow p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0 pr-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Picked</p>
              <p className="font-heading text-white text-lg leading-tight truncate">{itemType.toUpperCase()}</p>
            </div>
            <p className="font-heading text-yellow text-2xl flex-shrink-0">AED {currentRate}</p>
          </div>
          <button
            onClick={() => setScreen('photos')}
            className="w-full py-5 rounded-2xl bg-yellow text-black font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            NEXT <ArrowRight size={22} />
          </button>
        </div>
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  url,
  onTap,
}: {
  label: string;
  url: string;
  onTap: () => void;
}) {
  if (url) {
    return (
      <button
        onClick={onTap}
        className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-200 active:scale-95 transition-transform"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2 bg-black/70 text-yellow font-heading text-sm px-3 py-1 rounded-full">
          {label}
        </div>
        <div className="absolute bottom-2 right-2 bg-white text-black font-bold text-xs px-3 py-1.5 rounded-full flex items-center gap-1">
          <RotateCcw size={14} /> RETAKE
        </div>
      </button>
    );
  }
  return (
    <button
      onClick={onTap}
      className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
    >
      <CameraIcon size={36} className="text-gray-400" />
      <span className="font-heading text-xl">{label}</span>
      <span className="text-xs text-gray-500">Tap to add photo</span>
    </button>
  );
}
