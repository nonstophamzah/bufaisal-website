'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { getItems, updateItem } from '@/lib/appliance-api';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';
import SuccessFlash from '../components/SuccessFlash';
import ErrorFlash from '../components/ErrorFlash';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  condition: string | null;
  shop: string | null;
  photo_url: string | null;
  problems: string[] | null;
  repair_notes: string | null;
  claimed_by: string | null;
  destination_shop: string | null;
  date_received: string | null;
  date_sent_to_jurf: string | null;
  date_claimed: string | null;
  date_repaired: string | null;
  date_sent_to_shop: string | null;
  created_by: string | null;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SecurityPage() {
  const router = useRouter();
  const [worker, setWorker] = useState('');
  const [myShop, setMyShop] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Confirm modal
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'accept' | 'deny' } | null>(null);

  const COLS = 'id, barcode, product_type, brand, condition, shop, photo_url, problems, repair_notes, claimed_by, destination_shop, date_received, date_sent_to_jurf, date_claimed, date_repaired, date_sent_to_shop, created_by';

  // Parse shop letter from worker name (e.g. "Security A" → "A")
  function parseShopFromName(name: string): string {
    const match = name.match(/[A-E]$/i);
    return match ? match[0].toUpperCase() : '';
  }

  const fetchItems = useCallback(async (shop: string) => {
    if (!shop) return;
    setLoading(true);
    const data = await getItems({
      columns: COLS,
      filter: { location_status: 'sent_to_shop', destination_shop: shop },
      order: { column: 'date_sent_to_shop', ascending: true },
    });
    setItems(data as Item[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    const parsed = JSON.parse(w);
    setWorker(parsed.name);
    const shop = parseShopFromName(parsed.name);
    setMyShop(shop);
    if (shop) fetchItems(shop);
    else setLoading(false);
  }, [router, fetchItems]);

  const handleAccept = useCallback(async (itemId: string) => {
    setConfirmAction(null);
    setActionLoading(itemId);
    setErrorMsg('');

    const result = await updateItem(itemId, {
      location_status: 'at_shop',
      date_accepted_at_shop: new Date().toISOString(),
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(null);
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setActionLoading(null);
    setSuccessMsg('Item accepted!');
    setShowSuccess(true);
  }, []);

  const handleDeny = useCallback(async (itemId: string) => {
    setConfirmAction(null);
    setActionLoading(itemId);
    setErrorMsg('');

    const result = await updateItem(itemId, {
      location_status: 'denied',
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(null);
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setActionLoading(null);
    setSuccessMsg('Item denied — sent to manager queue');
    setShowSuccess(true);
  }, []);

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

  if (!myShop && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4">
        <p className="font-heading text-2xl text-red-500 mb-4">SHOP NOT DETECTED</p>
        <p className="text-gray-500 text-center mb-6">Your name must end with a shop letter (A-E).<br />Contact manager to fix your worker profile.</p>
        <button onClick={() => router.push('/appliances/select')} className="flex items-center gap-2 text-gray-500">
          <ArrowLeft size={18} /> Back to selection
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/appliances/select')} className="flex items-center gap-1 text-gray-500">
          <ArrowLeft size={20} /> Back
        </button>
        <button onClick={() => fetchItems(myShop)} className="flex items-center gap-1 text-gray-500 active:opacity-50">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      <h1 className="font-heading text-3xl mb-1">SECURITY — <span className="text-green-500">SHOP {myShop}</span></h1>
      <p className="text-gray-500 text-sm mb-6">Hi {worker} &bull; {items.length} item{items.length !== 1 ? 's' : ''} pending</p>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-10">
          <CheckCircle size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 font-heading text-lg">No items to review</p>
          <p className="text-gray-300 text-sm mt-1">All clear for Shop {myShop}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isExpanded = expanded === item.id;
            return (
              <div key={item.id} className="rounded-xl border-2 border-gray-200 bg-white overflow-hidden">
                {/* Card header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">{item.barcode}</p>
                    <p className="text-xs text-blue-500 mt-0.5">Repaired by {item.claimed_by || '—'} &bull; From Shop {item.shop}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    {/* Photo large */}
                    {item.photo_url && (
                      <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-100 mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    {/* Info grid */}
                    <div className="space-y-1.5 mb-3">
                      {[
                        ['Barcode', item.barcode],
                        ['Product', canonicalProductType(item.product_type)],
                        ['Brand', canonicalBrand(item.brand)],
                        ['Original Shop', item.shop],
                        ['Condition', item.condition?.replace(/_/g, ' ')],
                        ['Problems', item.problems?.join(', ') || '—'],
                        ['Repair Notes', item.repair_notes || '—'],
                        ['Repaired By', item.claimed_by || '—'],
                        ['Logged By', item.created_by || '—'],
                      ].map(([label, val]) => (
                        <div key={label} className="flex justify-between py-1 border-b border-gray-50">
                          <span className="text-xs text-gray-400">{label}</span>
                          <span className="text-xs font-semibold text-right max-w-[60%]">{val}</span>
                        </div>
                      ))}
                    </div>

                    {/* Timeline */}
                    <p className="font-bold text-xs text-gray-400 mb-1.5">TIMELINE</p>
                    <div className="space-y-1 mb-4">
                      {[
                        ['Received at shop', item.date_received],
                        ['Sent to Jurf', item.date_sent_to_jurf],
                        ['Claimed for repair', item.date_claimed],
                        ['Repair completed', item.date_repaired],
                        ['Sent to this shop', item.date_sent_to_shop],
                      ].map(([label, date]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-xs text-gray-400">{label}</span>
                          <span className="text-xs font-semibold">{fmtDate(date as string | null)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmAction({ id: item.id, action: 'deny' })}
                        disabled={actionLoading === item.id}
                        className="flex-1 py-4 rounded-xl bg-red-500 text-white font-heading text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <XCircle size={20} /> DENY
                      </button>
                      <button
                        onClick={() => setConfirmAction({ id: item.id, action: 'accept' })}
                        disabled={actionLoading === item.id}
                        className="flex-1 py-4 rounded-xl bg-green-500 text-white font-heading text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <CheckCircle size={20} /> ACCEPT
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsed action buttons */}
                {!isExpanded && (
                  <div className="flex gap-2 px-3 pb-3">
                    <button
                      onClick={() => setConfirmAction({ id: item.id, action: 'deny' })}
                      disabled={actionLoading === item.id}
                      className="flex-1 py-3 rounded-xl bg-red-100 text-red-600 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      {actionLoading === item.id ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} DENY
                    </button>
                    <button
                      onClick={() => setConfirmAction({ id: item.id, action: 'accept' })}
                      disabled={actionLoading === item.id}
                      className="flex-1 py-3 rounded-xl bg-green-100 text-green-600 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      {actionLoading === item.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} ACCEPT
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            {confirmAction.action === 'accept' ? (
              <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
            ) : (
              <XCircle size={48} className="mx-auto text-red-500 mb-4" />
            )}
            <p className="font-heading text-2xl mb-2">
              {confirmAction.action === 'accept' ? 'ACCEPT ITEM?' : 'DENY ITEM?'}
            </p>
            <p className="text-gray-500 mb-6">
              {confirmAction.action === 'accept'
                ? 'This item will be marked as received at your shop.'
                : 'This item will be sent back to the manager for review.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-4 rounded-2xl bg-gray-200 font-bold text-lg active:scale-95"
              >
                CANCEL
              </button>
              <button
                onClick={() => confirmAction.action === 'accept'
                  ? handleAccept(confirmAction.id)
                  : handleDeny(confirmAction.id)
                }
                className={`flex-1 py-4 rounded-2xl text-white font-bold text-lg active:scale-95 ${
                  confirmAction.action === 'accept' ? 'bg-green-500' : 'bg-red-500'
                }`}
              >
                {confirmAction.action === 'accept' ? 'ACCEPT' : 'DENY'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
