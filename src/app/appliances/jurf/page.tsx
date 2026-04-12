'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, PackageCheck, CheckSquare, Square, RefreshCw, Wrench } from 'lucide-react';
import { getItems, bulkUpdateItems } from '@/lib/appliance-api';
import SuccessFlash from '../components/SuccessFlash';
import ErrorFlash from '../components/ErrorFlash';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  condition: string | null;
  shop: string | null;
  date_sent_to_jurf: string | null;
  date_received_jurf: string | null;
  photo_url: string | null;
  tested_by: string | null;
  repair_status: string | null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const sent = new Date(dateStr);
  const now = new Date();
  const hours = Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Tab = 'pending' | 'repair';

export default function JurfPage() {
  const router = useRouter();
  const [worker, setWorker] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [pendingItems, setPendingItems] = useState<Item[]>([]);
  const [repairItems, setRepairItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const COLS = 'id, barcode, product_type, brand, condition, shop, date_sent_to_jurf, date_received_jurf, photo_url, tested_by, repair_status';

  const fetchPending = useCallback(async () => {
    const data = await getItems({
      columns: COLS,
      filter: { location_status: 'sent_to_jurf' },
      order: { column: 'date_sent_to_jurf', ascending: true },
    });
    setPendingItems(data as Item[]);
  }, []);

  const fetchRepair = useCallback(async () => {
    const data = await getItems({
      columns: COLS,
      filter: { location_status: 'at_jurf' },
      order: { column: 'date_received_jurf', ascending: false },
    });
    setRepairItems(data as Item[]);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPending(), fetchRepair()]);
    setLoading(false);
  }, [fetchPending, fetchRepair]);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    setWorker(JSON.parse(w).name);
    fetchAll();
  }, [router, fetchAll]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentItems = tab === 'pending' ? pendingItems : repairItems;

  const toggleAll = () => {
    if (selectedIds.size === currentItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(currentItems.map((i) => i.id)));
  };

  // Clear selection when switching tabs
  const switchTab = (t: Tab) => {
    setTab(t);
    setSelectedIds(new Set());
  };

  const handleConfirmReceipt = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    setErrorMsg('');

    const ids = Array.from(selectedIds);
    const result = await bulkUpdateItems(ids, {
      location_status: 'at_jurf',
      date_received_jurf: new Date().toISOString(),
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(false);
      return;
    }

    setSelectedIds(new Set());
    setActionLoading(false);
    setSuccessMsg(`${ids.length} item${ids.length > 1 ? 's' : ''} received!`);
    setShowSuccess(true);
    // Refresh both tabs
    fetchAll();
  }, [selectedIds, fetchAll]);

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

  // Group pending items by shop
  const pendingByShop: Record<string, Item[]> = {};
  for (const item of pendingItems) {
    const shop = item.shop || '?';
    if (!pendingByShop[shop]) pendingByShop[shop] = [];
    pendingByShop[shop].push(item);
  }
  const shopGroups = Object.entries(pendingByShop).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/appliances/select')} className="flex items-center gap-1 text-gray-500">
          <ArrowLeft size={20} /> Back
        </button>
        <button onClick={fetchAll} className="flex items-center gap-1 text-gray-500 active:opacity-50">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      <h1 className="font-heading text-3xl mb-1">JURF — <span className="text-orange-500">WORKSHOP</span></h1>
      <p className="text-gray-500 text-sm mb-4">Hi {worker}</p>

      {/* Tabs */}
      <div className="flex bg-gray-200 rounded-xl p-1 mb-6">
        <button
          onClick={() => switchTab('pending')}
          className={`flex-1 py-3 rounded-lg font-heading text-lg transition-colors relative ${
            tab === 'pending' ? 'bg-white text-black shadow-sm' : 'text-gray-500'
          }`}
        >
          ARRIVALS
          {pendingItems.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
              {pendingItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => switchTab('repair')}
          className={`flex-1 py-3 rounded-lg font-heading text-lg transition-colors ${
            tab === 'repair' ? 'bg-white text-black shadow-sm' : 'text-gray-500'
          }`}
        >
          IN REPAIR ({repairItems.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : tab === 'pending' ? (
        /* ═══ PENDING ARRIVALS TAB ═══ */
        <>
          {/* Confirm button */}
          <button
            onClick={handleConfirmReceipt}
            disabled={selectedIds.size === 0 || actionLoading}
            className="w-full py-6 rounded-2xl bg-green-500 text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 mb-6"
          >
            {actionLoading ? <Loader2 size={28} className="animate-spin" /> : <PackageCheck size={28} />}
            <span className="font-heading text-xl">
              {selectedIds.size > 0
                ? `CONFIRM ${selectedIds.size} ITEM${selectedIds.size > 1 ? 'S' : ''} RECEIVED`
                : 'CONFIRM RECEIPT'}
            </span>
          </button>

          {pendingItems.length === 0 ? (
            <div className="text-center py-10">
              <PackageCheck size={48} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 font-heading text-lg">No pending arrivals</p>
              <p className="text-gray-300 text-sm mt-1">All items have been received</p>
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg">PENDING ({pendingItems.length})</h2>
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-sm font-bold text-green-600 active:opacity-70"
                >
                  {selectedIds.size === pendingItems.length ? <CheckSquare size={20} /> : <Square size={20} />}
                  {selectedIds.size === pendingItems.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Grouped by shop */}
              {shopGroups.map(([shop, shopItems]) => (
                <div key={shop} className="mb-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2 px-1">From Shop {shop} ({shopItems.length})</p>
                  <div className="space-y-2">
                    {shopItems.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      const sentDate = item.date_sent_to_jurf ? new Date(item.date_sent_to_jurf) : null;
                      const hoursInTransit = sentDate ? Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60)) : 0;
                      const isOverdue = hoursInTransit > 24;

                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 transition-all text-left ${
                            isSelected
                              ? 'border-green-500 bg-green-50 ring-2 ring-green-300'
                              : isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {isSelected ? <CheckSquare size={22} className="text-green-500" /> : <Square size={22} className="text-gray-300" />}
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
                            <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                              Sent {timeAgo(item.date_sent_to_jurf)} {isOverdue && '— OVERDUE'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        /* ═══ IN REPAIR TAB ═══ */
        <>
          {repairItems.length === 0 ? (
            <div className="text-center py-10">
              <Wrench size={48} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 font-heading text-lg">No items in repair</p>
            </div>
          ) : (
            <div className="space-y-2">
              {repairItems.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border-2 border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {item.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{item.product_type} {item.brand ? `— ${item.brand}` : ''}</p>
                      <p className="text-xs text-gray-500">{item.barcode} &bull; From Shop {item.shop}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {item.repair_status && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{item.repair_status}</span>
                        )}
                        {item.tested_by && (
                          <span className="text-[10px] text-gray-400">Tested by {item.tested_by}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>Received {fmtDate(item.date_received_jurf)}</span>
                    <span>Sent {fmtDate(item.date_sent_to_jurf)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
