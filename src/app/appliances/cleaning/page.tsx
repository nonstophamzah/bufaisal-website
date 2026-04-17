'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, RefreshCw, Sparkles, PackageCheck, CheckCircle,
  ChevronDown, ChevronUp, Search, X, Camera as CameraIcon,
  AlertTriangle, Trash2,
} from 'lucide-react';
import { getItems, updateItem } from '@/lib/appliance-api';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';
import SuccessFlash from '../components/SuccessFlash';
import ErrorFlash from '../components/ErrorFlash';
import { uploadToCloudinary } from '../lib/upload';

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
  date_sent_to_jurf: string | null;
  date_repaired: string | null;
  date_cleaning_claimed: string | null;
  date_cleaned: string | null;
  cleaning_status: string | null;
  cleaned_by: string | null;
  before_cleaning_photos: string[] | null;
  after_cleaning_photos: string[] | null;
  cleaning_flagged: boolean | null;
}

type Tab = 'queue' | 'mywork' | 'done';

// Four mandatory angles — order is stable so we can show slot labels.
const ANGLE_LABELS = ['INSIDE', 'OUTSIDE', 'FRONT', 'BACK'] as const;

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

// Client-side compress → blob
function compressFile(file: File, maxW = 800, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxW) { h = (h * maxW) / w; w = maxW; }
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('No canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Compress failed')), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export default function CleaningPage() {
  const router = useRouter();
  const [worker, setWorker] = useState('');
  const [tab, setTab] = useState<Tab>('queue');
  const [queueItems, setQueueItems] = useState<Item[]>([]);
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [doneItems, setDoneItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [barcodeError, setBarcodeError] = useState('');

  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  // Alert-manager modal state
  const [flagTarget, setFlagTarget] = useState<Item | null>(null);
  const [flagNote, setFlagNote] = useState('');

  const COLS = 'id, barcode, product_type, brand, condition, shop, photo_url, problems, repair_notes, claimed_by, date_sent_to_jurf, date_repaired, date_cleaning_claimed, date_cleaned, cleaning_status, cleaned_by, before_cleaning_photos, after_cleaning_photos, cleaning_flagged';

  const fetchQueue = useCallback(async () => {
    const data = await getItems({
      columns: COLS,
      filter: { cleaning_status: 'pending', location_status: 'repaired' },
      order: { column: 'date_repaired', ascending: true },
    });
    setQueueItems(data as Item[]);
  }, []);

  const fetchMyWork = useCallback(async (name: string) => {
    const data = await getItems({
      columns: COLS,
      filter: { cleaning_status: 'in_cleaning', cleaned_by: name },
      order: { column: 'date_cleaning_claimed', ascending: false },
    });
    setMyItems(data as Item[]);
  }, []);

  const fetchDone = useCallback(async (name: string) => {
    const data = await getItems({
      columns: COLS,
      filter: { cleaning_status: 'cleaned', cleaned_by: name },
      order: { column: 'date_cleaned', ascending: false },
      limit: 50,
    });
    setDoneItems(data as Item[]);
  }, []);

  const fetchAll = useCallback(async (name: string) => {
    setLoading(true);
    await Promise.all([fetchQueue(), fetchMyWork(name), fetchDone(name)]);
    setLoading(false);
  }, [fetchQueue, fetchMyWork, fetchDone]);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    const parsed = JSON.parse(w);
    setWorker(parsed.name);
    fetchAll(parsed.name);
  }, [router, fetchAll]);

  // ── CLAIM ──
  const handleClaim = useCallback(async (itemId: string) => {
    setActionLoading(itemId);
    setErrorMsg('');
    const result = await updateItem(itemId, {
      cleaning_status: 'in_cleaning',
      cleaned_by: worker,
      date_cleaning_claimed: new Date().toISOString(),
    });
    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(null);
      return;
    }
    setActionLoading(null);
    setSuccessMsg('Item claimed for cleaning');
    setShowSuccess(true);
    fetchAll(worker);
  }, [worker, fetchAll]);

  // ── PHOTO UPLOAD (before/after × 4 slots) ──
  const handlePhotoSelect = useCallback(
    async (
      itemId: string,
      phase: 'before' | 'after',
      slotIndex: number,
      file: File,
    ) => {
      const slotKey = `${itemId}-${phase}-${slotIndex}`;
      setUploadingSlot(slotKey);
      setErrorMsg('');
      try {
        const blob = await compressFile(file);
        const url = await uploadToCloudinary(blob);

        // Read fresh from current state and update the array at the slot
        const item = myItems.find((i) => i.id === itemId);
        if (!item) { setUploadingSlot(null); return; }

        const col = phase === 'before' ? 'before_cleaning_photos' : 'after_cleaning_photos';
        const existing = (phase === 'before' ? item.before_cleaning_photos : item.after_cleaning_photos) || [];
        // Grow to 4 slots, place the URL at slotIndex
        const next = [...existing];
        while (next.length < 4) next.push('');
        next[slotIndex] = url;

        const result = await updateItem(itemId, { [col]: next });
        if (result.error) {
          setErrorMsg(result.error);
          setUploadingSlot(null);
          return;
        }
        // Patch local state so UI updates instantly
        setMyItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, [col]: next } : i)),
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      }
      setUploadingSlot(null);
    },
    [myItems],
  );

  const handlePhotoRemove = useCallback(
    async (itemId: string, phase: 'before' | 'after', slotIndex: number) => {
      const item = myItems.find((i) => i.id === itemId);
      if (!item) return;
      const col = phase === 'before' ? 'before_cleaning_photos' : 'after_cleaning_photos';
      const existing = (phase === 'before' ? item.before_cleaning_photos : item.after_cleaning_photos) || [];
      const next = [...existing];
      while (next.length < 4) next.push('');
      next[slotIndex] = '';

      const result = await updateItem(itemId, { [col]: next });
      if (result.error) { setErrorMsg(result.error); return; }
      setMyItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, [col]: next } : i)));
    },
    [myItems],
  );

  // ── MARK CLEAN ──
  const handleMarkClean = useCallback(async (itemId: string) => {
    const item = myItems.find((i) => i.id === itemId);
    if (!item) return;
    const before = (item.before_cleaning_photos || []).filter(Boolean);
    const after = (item.after_cleaning_photos || []).filter(Boolean);
    if (before.length < 4 || after.length < 4) {
      setErrorMsg(`Need all 4 before + 4 after photos (have ${before.length} before, ${after.length} after)`);
      return;
    }

    setActionLoading(itemId);
    setErrorMsg('');
    const result = await updateItem(itemId, {
      cleaning_status: 'cleaned',
      date_cleaned: new Date().toISOString(),
    });
    if (result.error) { setErrorMsg(result.error); setActionLoading(null); return; }
    setActionLoading(null);
    setSuccessMsg('Item cleaned — ready to ship');
    setShowSuccess(true);
    fetchAll(worker);
  }, [worker, myItems, fetchAll]);

  // ── ALERT MANAGER ──
  const submitFlag = useCallback(async () => {
    if (!flagTarget) return;
    const note = flagNote.trim();
    if (!note) { setErrorMsg('Add a short note so the manager knows what to check'); return; }
    setActionLoading(flagTarget.id);
    const result = await updateItem(flagTarget.id, {
      cleaning_flagged: true,
      cleaning_flag_note: note,
      cleaning_flagged_at: new Date().toISOString(),
    });
    if (result.error) { setErrorMsg(result.error); setActionLoading(null); return; }
    setActionLoading(null);
    setFlagTarget(null);
    setFlagNote('');
    setSuccessMsg('Manager alerted');
    setShowSuccess(true);
    fetchAll(worker);
  }, [flagTarget, flagNote, worker, fetchAll]);

  // ── Barcode search ──
  const handleBarcodeSearch = useCallback(() => {
    const q = barcodeQuery.trim();
    if (!q) return;
    setBarcodeError('');
    const inQueue = queueItems.find((i) => i.barcode === q);
    if (inQueue) { setTab('queue'); return; }
    const inMine = myItems.find((i) => i.barcode === q);
    if (inMine) { setTab('mywork'); setExpanded(inMine.id); return; }
    const inDone = doneItems.find((i) => i.barcode === q);
    if (inDone) { setTab('done'); return; }
    setBarcodeError('Barcode not found');
  }, [barcodeQuery, queueItems, myItems, doneItems]);

  const q = barcodeQuery.trim();
  const fQueue = q && !barcodeError ? queueItems.filter((i) => i.barcode === q) : queueItems;
  const fMine = q && !barcodeError ? myItems.filter((i) => i.barcode === q) : myItems;
  const fDone = q && !barcodeError ? doneItems.filter((i) => i.barcode === q) : doneItems;

  if (showSuccess) {
    return <SuccessFlash message={successMsg} onDone={() => { setShowSuccess(false); setSuccessMsg(''); }} />;
  }
  if (errorMsg) {
    return <ErrorFlash message={errorMsg} onRetry={() => setErrorMsg('')} />;
  }

  return (
    <div className="px-4 pt-4 pb-24 min-h-[calc(100vh-56px)] max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/appliances/select')} className="flex items-center gap-1 text-gray-500 min-h-[48px]">
          <ArrowLeft size={20} /> Back
        </button>
        <button onClick={() => fetchAll(worker)} className="flex items-center gap-1 text-gray-500 active:opacity-50 min-h-[48px]">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      <h1 className="font-heading text-3xl mb-1">CLEANING — <span className="text-cyan-500">JURF</span></h1>
      <p className="text-gray-500 text-sm mb-4">Hi {worker}</p>

      {/* Barcode search */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={barcodeQuery}
            onChange={(e) => { setBarcodeQuery(e.target.value); setBarcodeError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleBarcodeSearch()}
            placeholder="Search by barcode..."
            className="flex-1 px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400"
          />
          <button
            onClick={handleBarcodeSearch}
            disabled={!barcodeQuery.trim()}
            className="px-4 py-3 rounded-xl bg-cyan-500 text-white font-bold text-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-40 min-h-[48px]"
          >
            <Search size={16} /> SEARCH
          </button>
          {barcodeQuery.trim() && (
            <button
              onClick={() => { setBarcodeQuery(''); setBarcodeError(''); }}
              className="px-3 py-3 rounded-xl bg-gray-200 text-gray-500 font-bold text-sm active:scale-95 min-h-[48px]"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {barcodeError && <p className="text-red-500 text-sm font-bold mt-2">{barcodeError}</p>}
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-200 rounded-xl p-1 mb-6">
        {([
          { key: 'queue' as Tab, label: 'QUEUE', count: queueItems.length },
          { key: 'mywork' as Tab, label: 'MY WORK', count: myItems.length },
          { key: 'done' as Tab, label: 'DONE', count: doneItems.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 rounded-lg font-heading text-sm transition-colors relative min-h-[48px] ${
              tab === t.key ? 'bg-white text-black shadow-sm' : 'text-gray-500'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : tab === 'queue' ? (
        /* ═══ QUEUE TAB ═══ */
        fQueue.length === 0 ? (
          <div className="text-center py-10">
            <PackageCheck size={48} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 font-heading text-lg">{q ? 'Barcode not found in queue' : 'No items to clean'}</p>
            <p className="text-gray-300 text-sm mt-1">{q ? 'Check other tabs' : 'Repairs will show up here'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {fQueue.map((item) => (
              <div key={item.id} className="rounded-xl border-2 border-gray-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Repaired {timeAgo(item.date_repaired)} by {item.claimed_by || '—'}</p>
                  </div>
                  <button
                    onClick={() => handleClaim(item.id)}
                    disabled={actionLoading === item.id}
                    className="px-4 py-3 rounded-xl bg-cyan-500 text-white font-heading text-sm active:scale-95 transition-transform disabled:opacity-50 min-h-[48px] flex items-center gap-1"
                  >
                    {actionLoading === item.id ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    CLAIM
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'mywork' ? (
        /* ═══ MY WORK TAB ═══ */
        fMine.length === 0 ? (
          <div className="text-center py-10">
            <Sparkles size={48} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 font-heading text-lg">{q ? 'Not found' : 'No cleaning in progress'}</p>
            <p className="text-gray-300 text-sm mt-1">{q ? 'Check other tabs' : 'Claim items from the queue'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fMine.map((item) => {
              const isExpanded = expanded === item.id;
              const before = item.before_cleaning_photos || [];
              const after = item.after_cleaning_photos || [];
              const beforeCount = before.filter(Boolean).length;
              const afterCount = after.filter(Boolean).length;
              const ready = beforeCount >= 4 && afterCount >= 4;

              return (
                <div key={item.id} className="rounded-xl border-2 border-cyan-200 bg-white overflow-hidden">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {item.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">
                        {canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop}</p>
                      <p className="text-xs mt-0.5">
                        <span className={beforeCount === 4 ? 'text-green-600' : 'text-orange-500'}>
                          Before {beforeCount}/4
                        </span>
                        {' · '}
                        <span className={afterCount === 4 ? 'text-green-600' : 'text-orange-500'}>
                          After {afterCount}/4
                        </span>
                        {item.cleaning_flagged && (
                          <span className="text-amber-600 ml-2">&bull; FLAGGED</span>
                        )}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-4">
                      {item.repair_notes && (
                        <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-2">
                          <span className="font-bold">Repair notes:</span> {item.repair_notes}
                        </div>
                      )}

                      {/* BEFORE grid */}
                      <div>
                        <p className="font-bold text-xs text-gray-500 mb-2">BEFORE CLEANING</p>
                        <PhotoGrid
                          item={item}
                          phase="before"
                          onSelect={handlePhotoSelect}
                          onRemove={handlePhotoRemove}
                          uploadingSlot={uploadingSlot}
                        />
                      </div>

                      {/* AFTER grid */}
                      <div>
                        <p className="font-bold text-xs text-gray-500 mb-2">AFTER CLEANING</p>
                        <PhotoGrid
                          item={item}
                          phase="after"
                          onSelect={handlePhotoSelect}
                          onRemove={handlePhotoRemove}
                          uploadingSlot={uploadingSlot}
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => { setFlagTarget(item); setFlagNote(''); }}
                          disabled={actionLoading === item.id}
                          className="flex-1 py-4 rounded-xl bg-amber-100 text-amber-700 font-heading text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 border border-amber-200"
                        >
                          <AlertTriangle size={18} /> ALERT MANAGER
                        </button>
                        <button
                          onClick={() => handleMarkClean(item.id)}
                          disabled={!ready || actionLoading === item.id}
                          className="flex-1 py-4 rounded-xl bg-green-500 text-white font-heading text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                        >
                          {actionLoading === item.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                          {ready ? 'MARK CLEAN' : `NEED ${(4 - beforeCount) + (4 - afterCount)}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ═══ DONE TAB ═══ */
        fDone.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle size={48} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 font-heading text-lg">No completed cleanings yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {fDone.map((item) => (
              <div key={item.id} className="rounded-xl border-2 border-green-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop}</p>
                    <p className="text-xs text-green-600 mt-0.5">Cleaned {timeAgo(item.date_cleaned)}</p>
                  </div>
                  <CheckCircle size={22} className="text-green-500" />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Alert-manager modal */}
      {flagTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={24} className="text-amber-500" />
              <p className="font-heading text-2xl">ALERT MANAGER</p>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Tell the manager what you noticed. The item stays with you so you can keep cleaning.
            </p>
            <textarea
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              placeholder="e.g. Cracked door seal, rust on top, missing screw…"
              rows={4}
              className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-amber-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setFlagTarget(null); setFlagNote(''); }}
                className="flex-1 py-4 rounded-2xl bg-gray-200 font-bold text-lg active:scale-95"
              >
                CANCEL
              </button>
              <button
                onClick={submitFlag}
                disabled={actionLoading === flagTarget.id || !flagNote.trim()}
                className="flex-1 py-4 rounded-2xl bg-amber-500 text-white font-bold text-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === flagTarget.id ? <Loader2 size={18} className="animate-spin" /> : null}
                ALERT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════ PhotoGrid (4 slots per phase) ═════════════════
function PhotoGrid({
  item, phase, onSelect, onRemove, uploadingSlot,
}: {
  item: Item;
  phase: 'before' | 'after';
  onSelect: (itemId: string, phase: 'before' | 'after', slotIndex: number, file: File) => void;
  onRemove: (itemId: string, phase: 'before' | 'after', slotIndex: number) => void;
  uploadingSlot: string | null;
}) {
  const photos = (phase === 'before' ? item.before_cleaning_photos : item.after_cleaning_photos) || [];
  return (
    <div className="grid grid-cols-4 gap-2">
      {ANGLE_LABELS.map((label, i) => {
        const url = photos[i] || '';
        const slotKey = `${item.id}-${phase}-${i}`;
        const isUploading = uploadingSlot === slotKey;
        return (
          <Slot
            key={label}
            label={label}
            url={url}
            isUploading={isUploading}
            onPick={(file) => onSelect(item.id, phase, i, file)}
            onRemove={() => onRemove(item.id, phase, i)}
          />
        );
      })}
    </div>
  );
}

function Slot({ label, url, isUploading, onPick, onRemove }: {
  label: string;
  url: string;
  isUploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold text-center text-gray-500">{label}</p>
      {url ? (
        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-green-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            type="button"
            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
            aria-label="Remove"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 active:border-cyan-500 active:text-cyan-500 disabled:opacity-50"
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <CameraIcon size={20} />}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}
