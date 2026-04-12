'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Truck, Trash2, Lock, X, CheckSquare, Square } from 'lucide-react';
import { getItems, bulkUpdateItems, checkManagerCode } from '@/lib/appliance-api';
import SuccessFlash from '../../components/SuccessFlash';
import ErrorFlash from '../../components/ErrorFlash';

const SHOPS = ['A', 'B', 'C', 'D', 'E'];

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  condition: string | null;
  shop: string | null;
  photo_url: string | null;
}

const CONDITION_BADGE: Record<string, string> = {
  working: 'bg-green-500 text-white',
  not_working: 'bg-orange-500 text-white',
  pending_scrap: 'bg-red-400 text-white',
  scrap: 'bg-red-600 text-white',
  repaired: 'bg-blue-500 text-white',
};

function conditionLabel(c: string | null) {
  if (!c) return 'Unknown';
  return c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function ShopOutPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState(false);

  // PIN modal for scrap
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  const fetchItems = useCallback(async (shop: string) => {
    setLoading(true);
    setSelectedIds(new Set());
    const data = await getItems({
      columns: 'id, barcode, product_type, brand, condition, shop, photo_url',
      filter: {
        approval_status: 'approved',
        shop: shop,
        needs_jurf: 'true',
        location_status: 'at_shop',
      },
      order: { column: 'created_at', ascending: false },
    });
    setItems(data as Item[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
  }, [router]);

  const handleShopSelect = (shop: string) => {
    setSelectedShop(shop);
    fetchItems(shop);
  };

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };

  // ── Send to Jurf (batch) ──
  const handleSendToJurf = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setShowConfirm(false);
    setActionLoading(true);
    setErrorMsg('');

    const ids = Array.from(selectedIds);
    const result = await bulkUpdateItems(ids, {
      date_sent_to_jurf: new Date().toISOString(),
      location_status: 'sent_to_jurf',
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(false);
      return;
    }

    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setActionLoading(false);
    setSuccessMsg(`${ids.length} item${ids.length > 1 ? 's' : ''} sent to Jurf!`);
    setShowSuccess(true);
  }, [selectedIds]);

  // ── Scrap (batch) ──
  const handleScrapConfirm = useCallback(async () => {
    if (selectedIds.size === 0 || !pin.trim()) return;
    setPinLoading(true);
    setPinError(false);
    setErrorMsg('');

    const valid = await checkManagerCode(pin.trim());
    if (!valid) {
      setPinError(true);
      setPinLoading(false);
      return;
    }

    const ids = Array.from(selectedIds);
    const result = await bulkUpdateItems(ids, {
      condition: 'pending_scrap',
      location_status: 'scrapped',
    });

    if (result.error) {
      setShowPinModal(false);
      setPin('');
      setPinLoading(false);
      setErrorMsg(result.error);
      return;
    }

    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setShowPinModal(false);
    setPin('');
    setPinLoading(false);
    setSuccessMsg(`${ids.length} item${ids.length > 1 ? 's' : ''} sent for scrap approval`);
    setShowSuccess(true);
  }, [selectedIds, pin]);

  const openPinModal = () => {
    if (selectedIds.size === 0) return;
    setPin('');
    setPinError(false);
    setShowPinModal(true);
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

  // ── STEP 1: Shop selector ──
  if (!selectedShop) {
    return (
      <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
        <button onClick={() => router.push('/appliances/shop')} className="flex items-center gap-1 text-gray-500 mb-6">
          <ArrowLeft size={20} /> Back
        </button>
        <h1 className="font-heading text-3xl mb-2">LOG OUT — <span className="text-orange-500">SEND</span></h1>
        <p className="text-gray-500 mb-8">Select shop to view items</p>
        <div className="grid grid-cols-3 gap-3">
          {SHOPS.map((s) => (
            <button
              key={s}
              onClick={() => handleShopSelect(s)}
              className="py-8 rounded-2xl bg-white border-2 border-gray-200 font-heading text-3xl active:scale-95 active:border-orange-500 transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 2: Item list with multi-select ──
  return (
    <div className="px-4 pt-4 pb-32 min-h-[calc(100vh-56px)]">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => { setSelectedShop(null); setItems([]); setSelectedIds(new Set()); }} className="flex items-center gap-1 text-gray-500">
          <ArrowLeft size={20} /> Shop {selectedShop}
        </button>
      </div>
      <h1 className="font-heading text-3xl mb-1">SHOP {selectedShop} — <span className="text-orange-500">ITEMS READY FOR JURF</span></h1>
      <p className="text-gray-500 text-sm mb-6">{items.length} item{items.length !== 1 ? 's' : ''}</p>

      {/* Select all + count */}
      {items.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm font-bold text-orange-500 active:opacity-70"
          >
            {selectedIds.size === items.length ? <CheckSquare size={20} /> : <Square size={20} />}
            {selectedIds.size === items.length ? 'Deselect All' : 'Select All'}
          </button>
          {selectedIds.size > 0 && (
            <span className="text-sm font-bold text-gray-500">{selectedIds.size} selected</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No items ready to send from Shop {selectedShop}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 transition-all text-left ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-300'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex-shrink-0">
                  {isSelected ? <CheckSquare size={22} className="text-orange-500" /> : <Square size={22} className="text-gray-300" />}
                </div>
                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                  {item.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{item.product_type} {item.brand ? `— ${item.brand}` : ''}</p>
                  <p className="text-xs text-gray-500">{item.barcode}</p>
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${CONDITION_BADGE[item.condition || ''] || 'bg-gray-400 text-white'}`}>
                    {conditionLabel(item.condition)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Sticky bottom bar ── */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 space-y-3 z-30">
          <button
            onClick={() => selectedIds.size > 0 && setShowConfirm(true)}
            disabled={selectedIds.size === 0 || actionLoading}
            className="w-full py-5 rounded-2xl bg-orange-500 text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
          >
            {actionLoading ? <Loader2 size={24} className="animate-spin" /> : <Truck size={24} />}
            <span className="font-heading text-xl">
              {selectedIds.size > 0
                ? `SEND ${selectedIds.size} ITEM${selectedIds.size > 1 ? 'S' : ''} TO JURF`
                : 'SEND TO JURF'}
            </span>
          </button>
          <button
            onClick={openPinModal}
            disabled={selectedIds.size === 0 || actionLoading}
            className="w-full py-4 rounded-2xl bg-gray-200 text-gray-600 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
          >
            <Trash2 size={20} />
            <span className="font-heading text-lg">SCRAP</span>
          </button>
        </div>
      )}

      {/* ── Send confirmation modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            <Truck size={48} className="mx-auto text-orange-500 mb-4" />
            <p className="font-heading text-2xl mb-2">SEND TO JURF?</p>
            <p className="text-gray-500 mb-6">
              {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} from Shop {selectedShop} will be sent to Jurf
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-4 rounded-2xl bg-gray-200 font-bold text-lg active:scale-95">CANCEL</button>
              <button onClick={handleSendToJurf} className="flex-1 py-4 rounded-2xl bg-orange-500 text-white font-bold text-lg active:scale-95">SEND</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Modal for scrap ── */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 relative">
            <button onClick={() => { setShowPinModal(false); setPin(''); setPinError(false); }} className="absolute top-4 right-4 text-gray-400">
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
