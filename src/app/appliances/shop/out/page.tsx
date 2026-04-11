'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Truck, Trash2, Lock, X } from 'lucide-react';
import { getItems, updateItem, checkManagerCode } from '@/lib/appliance-api';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';
import SuccessFlash from '../../components/SuccessFlash';
import ErrorFlash from '../../components/ErrorFlash';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Success / error feedback
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // PIN modal for scrap
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    const data = await getItems({
      columns: 'id, barcode, product_type, brand, status, shop, photo_url',
      filter: { approval_status: 'approved' },
      order: { column: 'created_at', ascending: false },
    });
    setItems(data as Item[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    fetchItems();
  }, [router, fetchItems]);

  // ── Send to Jurf ──
  const handleSendToJurf = useCallback(async () => {
    if (!selectedId) return;
    setActionLoading(true);
    setErrorMsg('');

    const result = await updateItem(selectedId, {
      date_sent_to_jurf: new Date().toISOString(),
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(false);
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setSelectedId(null);
    setActionLoading(false);
    setSuccessMsg('Sent to Jurf!');
    setShowSuccess(true);
  }, [selectedId]);

  // ── Scrap ──
  const handleScrapConfirm = useCallback(async () => {
    if (!selectedId || !pin.trim()) return;
    setPinLoading(true);
    setPinError(false);
    setErrorMsg('');

    const valid = await checkManagerCode(pin.trim());
    if (!valid) {
      setPinError(true);
      setPinLoading(false);
      return;
    }

    const result = await updateItem(selectedId, {
      status: 'Pending Scrap',
    });

    if (result.error) {
      setShowPinModal(false);
      setPin('');
      setPinLoading(false);
      setErrorMsg(result.error);
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setSelectedId(null);
    setShowPinModal(false);
    setPin('');
    setPinLoading(false);
    setSuccessMsg('Sent for scrap approval');
    setShowSuccess(true);
  }, [selectedId, pin]);

  const openPinModal = () => {
    if (!selectedId) return;
    setPin('');
    setPinError(false);
    setShowPinModal(true);
  };

  const closePinModal = () => {
    setShowPinModal(false);
    setPin('');
    setPinError(false);
  };

  // ── Full-screen states ──
  if (showSuccess) {
    return (
      <SuccessFlash
        message={successMsg}
        onDone={() => { setShowSuccess(false); setSuccessMsg(''); }}
      />
    );
  }

  if (errorMsg) {
    return <ErrorFlash message={errorMsg} onRetry={() => setErrorMsg('')} />;
  }

  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
      <button onClick={() => router.push('/appliances/shop')} className="flex items-center gap-1 text-gray-500 mb-6">
        <ArrowLeft size={20} /> Back
      </button>
      <h1 className="font-heading text-3xl mb-6">LOG OUT — <span className="text-orange-500">SEND</span></h1>

      {/* Action buttons */}
      <div className="space-y-4 mb-8">
        <button
          onClick={handleSendToJurf}
          disabled={!selectedId || actionLoading}
          className="w-full py-8 rounded-2xl bg-orange-500 text-white flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
        >
          {actionLoading ? (
            <Loader2 size={36} className="animate-spin" />
          ) : (
            <Truck size={36} />
          )}
          <span className="font-heading text-2xl">SEND TO JURF</span>
        </button>
        <button
          onClick={openPinModal}
          disabled={!selectedId || actionLoading}
          className="w-full py-8 rounded-2xl bg-gray-500 text-white flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
        >
          <Trash2 size={36} />
          <span className="font-heading text-2xl">SCRAP</span>
        </button>
      </div>

      {/* Hint */}
      {!selectedId && items.length > 0 && (
        <p className="text-center text-sm text-gray-400 mb-4">Tap an item below to select it</p>
      )}

      <h2 className="font-heading text-xl mb-3">APPROVED ITEMS ({items.length})</h2>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No approved items to log out</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 20).map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
              className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 transition-all text-left ${
                selectedId === item.id
                  ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-300'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {item.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}</p>
                <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop}</p>
              </div>
              {selectedId === item.id && (
                <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── PIN Modal ── */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 relative">
            <button onClick={closePinModal} className="absolute top-4 right-4 text-gray-400">
              <X size={22} />
            </button>

            <div className="flex flex-col items-center gap-3 mb-6">
              <Lock size={32} className="text-gray-600" />
              <h2 className="font-heading text-2xl">MANAGER PIN</h2>
              <p className="text-sm text-gray-500 text-center">Enter manager code to approve scrap</p>
            </div>

            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handleScrapConfirm()}
              placeholder="Manager code"
              autoFocus
              className={`w-full text-center text-xl px-4 py-4 rounded-xl border-2 focus:outline-none mb-3 ${
                pinError ? 'border-red-500 animate-[shake_0.3s_ease-in-out]' : 'border-gray-200 focus:border-yellow'
              }`}
            />

            {pinError && <p className="text-red-500 text-sm font-bold text-center mb-3">Invalid manager code</p>}

            <button
              onClick={handleScrapConfirm}
              disabled={!pin.trim() || pinLoading}
              className="w-full py-4 rounded-xl bg-red-500 text-white font-heading text-xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
            >
              {pinLoading && <Loader2 size={20} className="animate-spin" />}
              CONFIRM SCRAP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
