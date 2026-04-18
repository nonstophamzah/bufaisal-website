'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, RefreshCw, Wrench, PackageCheck, Truck,
  Lock, ChevronDown, ChevronUp, Search, X,
  Package, Plus, Camera as CameraIcon, Sparkles, Trash2,
} from 'lucide-react';
import {
  getItems, updateItem,
  getPartsForItem, logSparePartUsage,
  type SparePartUsage,
} from '@/lib/appliance-api';
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
  date_sent_to_jurf: string | null;
  date_received_jurf: string | null;
  date_claimed: string | null;
  claimed_by: string | null;
  repair_notes: string | null;
  problems: string[] | null;
  needs_jurf: boolean;
  cleaning_status: string | null;
}

const SHOPS = ['A', 'B', 'C', 'D', 'E'];

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

type Tab = 'queue' | 'repairs' | 'send';

// Keep in sync with the Gemini prompt in /api/gemini and ALLOWED_PART_TYPES
// in /api/appliances. UI labels are the presentable version.
const PART_TYPES: { value: string; label: string }[] = [
  { value: 'compressor', label: 'Compressor' },
  { value: 'motor', label: 'Motor' },
  { value: 'pcb', label: 'PCB' },
  { value: 'control_board', label: 'Control Board' },
  { value: 'thermostat', label: 'Thermostat' },
  { value: 'heating_element', label: 'Heating Element' },
  { value: 'fan', label: 'Fan' },
  { value: 'pump', label: 'Pump' },
  { value: 'drum', label: 'Drum' },
  { value: 'door_seal', label: 'Door Seal' },
  { value: 'valve', label: 'Valve' },
  { value: 'sensor', label: 'Sensor' },
  { value: 'wiring', label: 'Wiring' },
  { value: 'other', label: 'Other' },
];

function partTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Other';
  const match = PART_TYPES.find((t) => t.value === value);
  return match ? match.label : 'Other';
}

// Compress image same as Camera.tsx / cleaning page
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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = reader.result as string;
      // strip "data:...;base64," prefix
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
}

export default function JurfPage() {
  const router = useRouter();
  const [worker, setWorker] = useState('');
  const [tab, setTab] = useState<Tab>('queue');
  const [queueItems, setQueueItems] = useState<Item[]>([]);
  const [repairItems, setRepairItems] = useState<Item[]>([]);
  const [sendItems, setSendItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Barcode search
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [barcodeError, setBarcodeError] = useState('');

  // Repair notes per item
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Destination shop per item
  const [destShop, setDestShop] = useState<Record<string, string>>({});
  // Expanded item for details
  const [expanded, setExpanded] = useState<string | null>(null);

  // ─── Spare parts state ────────────────────────────────────────
  // Cached parts per item id (so we don't refetch on every render)
  const [partsByItem, setPartsByItem] = useState<Record<string, SparePartUsage[]>>({});
  // Which item has its "Log Part" form open (null = none)
  const [partFormItem, setPartFormItem] = useState<string | null>(null);
  // Form state while logging a part
  const [partBarcode, setPartBarcode] = useState('');
  const [partLabelText, setPartLabelText] = useState('');
  const [partType, setPartType] = useState<string>('other');
  const [partNotes, setPartNotes] = useState('');
  const [partPhotoUrl, setPartPhotoUrl] = useState('');
  const [partUploading, setPartUploading] = useState(false);
  const [partAnalyzing, setPartAnalyzing] = useState(false);
  const [partSubmitting, setPartSubmitting] = useState(false);
  const [partFormError, setPartFormError] = useState('');
  const partFileRef = useRef<HTMLInputElement>(null);

  const COLS = 'id, barcode, product_type, brand, condition, shop, photo_url, date_sent_to_jurf, date_received_jurf, date_claimed, claimed_by, repair_notes, problems, needs_jurf, cleaning_status';

  const fetchQueue = useCallback(async () => {
    const data = await getItems({
      columns: COLS,
      filter: { location_status: 'sent_to_jurf' },
      order: { column: 'date_sent_to_jurf', ascending: true },
    });
    setQueueItems(data as Item[]);
  }, []);

  const fetchRepairs = useCallback(async (name: string) => {
    const data = await getItems({
      columns: COLS,
      filter: { location_status: 'in_repair', claimed_by: name },
      order: { column: 'date_claimed', ascending: false },
    });
    setRepairItems(data as Item[]);
  }, []);

  const fetchSend = useCallback(async (name: string) => {
    // Only show items that have cleared the cleaning gate. Items that are
    // repaired but still 'pending' / 'in_cleaning' are held back until a
    // cleaner has captured 4 before + 4 after photos and marked them clean.
    const data = await getItems({
      columns: COLS,
      filter: { location_status: 'repaired', claimed_by: name, cleaning_status: 'cleaned' },
      order: { column: 'date_repaired', ascending: false },
    });
    setSendItems(data as Item[]);
  }, []);

  // Fetch spare parts for a specific item id and cache them
  const fetchPartsForItemId = useCallback(async (itemId: string) => {
    try {
      const parts = await getPartsForItem(itemId);
      setPartsByItem((prev) => ({ ...prev, [itemId]: parts }));
    } catch {
      // Silent fail — parts section just shows empty. Error surfaces on submit.
    }
  }, []);

  const fetchAll = useCallback(async (name: string) => {
    setLoading(true);
    await Promise.all([fetchQueue(), fetchRepairs(name), fetchSend(name)]);
    setLoading(false);
  }, [fetchQueue, fetchRepairs, fetchSend]);

  // Whenever repair items change, fetch parts for each of them in parallel.
  // This keeps the expanded card ready without a loading flicker.
  useEffect(() => {
    if (repairItems.length === 0) return;
    const ids = repairItems.map((i) => i.id);
    Promise.all(ids.map((id) => getPartsForItem(id).then((parts) => [id, parts] as const)))
      .then((results) => {
        setPartsByItem((prev) => {
          const next = { ...prev };
          for (const [id, parts] of results) next[id] = parts;
          return next;
        });
      })
      .catch(() => { /* soft-fail */ });
  }, [repairItems]);

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
      location_status: 'in_repair',
      claimed_by: worker,
      date_claimed: new Date().toISOString(),
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(null);
      return;
    }

    setActionLoading(null);
    setSuccessMsg('Item claimed!');
    setShowSuccess(true);
    fetchAll(worker);
  }, [worker, fetchAll]);

  // ── REPAIR DONE ──
  const handleRepairDone = useCallback(async (itemId: string) => {
    setActionLoading(itemId);
    setErrorMsg('');

    const result = await updateItem(itemId, {
      condition: 'repaired',
      location_status: 'repaired',
      repair_notes: notes[itemId] || null,
      date_repaired: new Date().toISOString(),
      // Hand the item to the cleaning queue. Send tab will only
      // expose items once cleaning_status flips to 'cleaned'.
      cleaning_status: 'pending',
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(null);
      return;
    }

    setActionLoading(null);
    setSuccessMsg('Repair complete!');
    setShowSuccess(true);
    fetchAll(worker);
  }, [worker, notes, fetchAll]);

  // ── SEND TO SHOP ──
  const handleSendToShop = useCallback(async (itemId: string) => {
    const shop = destShop[itemId];
    if (!shop) return;

    setActionLoading(itemId);
    setErrorMsg('');

    const result = await updateItem(itemId, {
      location_status: 'sent_to_shop',
      destination_shop: shop,
      date_sent_to_shop: new Date().toISOString(),
    });

    if (result.error) {
      setErrorMsg(result.error);
      setActionLoading(null);
      return;
    }

    setActionLoading(null);
    setSuccessMsg(`Sent to Shop ${shop}!`);
    setShowSuccess(true);
    fetchAll(worker);
  }, [worker, destShop, fetchAll]);

  // ═══════════════ Spare part form ═══════════════

  const resetPartForm = useCallback(() => {
    setPartBarcode('');
    setPartLabelText('');
    setPartType('other');
    setPartNotes('');
    setPartPhotoUrl('');
    setPartFormError('');
    setPartUploading(false);
    setPartAnalyzing(false);
    setPartSubmitting(false);
  }, []);

  const openPartForm = useCallback((itemId: string) => {
    resetPartForm();
    setPartFormItem(itemId);
  }, [resetPartForm]);

  const closePartForm = useCallback(() => {
    setPartFormItem(null);
    resetPartForm();
  }, [resetPartForm]);

  // Photo → compress → Cloudinary upload → Gemini analysis in parallel
  const handlePartPhoto = useCallback(async (file: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setPartFormError('Photo too large (max 15MB)');
      return;
    }

    setPartFormError('');
    setPartUploading(true);
    setPartAnalyzing(true);

    try {
      const blob = await compressFile(file);
      // Run upload and Gemini analysis in parallel — both use the same blob
      const base64Promise = blobToBase64(blob);
      const uploadPromise = uploadToCloudinary(blob);

      // Gemini first (fast) — fill the form so the tech can review while upload finishes
      const base64 = await base64Promise;
      const analyzeRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          action: 'spare_part_analysis',
        }),
      });
      const analyzeData = await analyzeRes.json();

      if (analyzeRes.ok && analyzeData.text) {
        const match = analyzeData.text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.readable !== false) {
              if (parsed.part_barcode) setPartBarcode(String(parsed.part_barcode));
              // Prefer combined label_text, fall back to brand+model if missing
              let labelText = parsed.part_label_text;
              if (!labelText && (parsed.part_brand || parsed.part_model)) {
                labelText = [parsed.part_brand, parsed.part_model].filter(Boolean).join(' ');
              }
              if (labelText) setPartLabelText(String(labelText));
              if (parsed.part_type && typeof parsed.part_type === 'string') {
                const valid = PART_TYPES.some((t) => t.value === parsed.part_type);
                if (valid) setPartType(parsed.part_type);
              }
            }
          } catch {
            // JSON parse failed — leave form empty, tech fills manually
          }
        }
      }
      setPartAnalyzing(false);

      // Now wait for upload to finish
      const url = await uploadPromise;
      setPartPhotoUrl(url);
    } catch (err) {
      setPartFormError(err instanceof Error ? err.message : 'Photo upload failed');
      setPartAnalyzing(false);
    }
    setPartUploading(false);
  }, []);

  const submitPart = useCallback(async () => {
    if (!partFormItem) return;
    if (!partPhotoUrl) {
      setPartFormError('Photo is required');
      return;
    }
    if (!partBarcode.trim()) {
      setPartFormError('Part barcode is required');
      return;
    }

    setPartFormError('');
    setPartSubmitting(true);

    const result = await logSparePartUsage({
      part_barcode: partBarcode.trim(),
      part_label_text: partLabelText.trim() || null,
      part_type: partType,
      installed_in_item_id: partFormItem,
      installed_by: worker,
      photo_url: partPhotoUrl,
      notes: partNotes.trim() || null,
    });

    if (result.error) {
      setPartFormError(result.error);
      setPartSubmitting(false);
      return;
    }

    // Refresh this item's parts list, close form
    await fetchPartsForItemId(partFormItem);
    closePartForm();
    setSuccessMsg('Spare part logged');
    setShowSuccess(true);
  }, [
    partFormItem, partPhotoUrl, partBarcode, partLabelText, partType,
    partNotes, worker, fetchPartsForItemId, closePartForm,
  ]);

  // ── Barcode search ──
  const handleBarcodeSearch = useCallback(() => {
    const q = barcodeQuery.trim();
    if (!q) return;
    setBarcodeError('');

    // Search across all tabs
    const inQueue = queueItems.find((i) => i.barcode === q);
    if (inQueue) { setTab('queue'); setBarcodeError(''); return; }

    const inRepairs = repairItems.find((i) => i.barcode === q);
    if (inRepairs) { setTab('repairs'); setExpanded(inRepairs.id); setBarcodeError(''); return; }

    const inSend = sendItems.find((i) => i.barcode === q);
    if (inSend) { setTab('send'); setBarcodeError(''); return; }

    setBarcodeError('Barcode not found');
  }, [barcodeQuery, queueItems, repairItems, sendItems]);

  // Filter items in current tab by barcode search
  const q = barcodeQuery.trim();
  const filteredQueue = q && !barcodeError ? queueItems.filter((i) => i.barcode === q) : queueItems;
  const filteredRepairs = q && !barcodeError ? repairItems.filter((i) => i.barcode === q) : repairItems;
  const filteredSend = q && !barcodeError ? sendItems.filter((i) => i.barcode === q) : sendItems;

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

  // Group queue items by shop (using filtered list)
  const queueByShop: Record<string, Item[]> = {};
  for (const item of filteredQueue) {
    const s = item.shop || '?';
    if (!queueByShop[s]) queueByShop[s] = [];
    queueByShop[s].push(item);
  }
  const shopGroups = Object.entries(queueByShop).sort(([a], [b]) => a.localeCompare(b));

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

      <h1 className="font-heading text-3xl mb-1">JURF — <span className="text-blue-500">WORKSHOP</span></h1>
      <p className="text-gray-500 text-sm mb-4">Hi {worker}</p>

      {/* Barcode search */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="text"
            value={barcodeQuery}
            onChange={(e) => { setBarcodeQuery(e.target.value); setBarcodeError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleBarcodeSearch()}
            placeholder="Search by barcode..."
            className="flex-1 px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleBarcodeSearch}
            disabled={!barcodeQuery.trim()}
            className="px-4 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-40 min-h-[48px]"
          >
            <Search size={16} />
            SEARCH
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
          { key: 'repairs' as Tab, label: 'MY REPAIRS', count: repairItems.length },
          { key: 'send' as Tab, label: 'SEND', count: sendItems.length },
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
        <>
          {filteredQueue.length === 0 ? (
            <div className="text-center py-10">
              <PackageCheck size={48} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 font-heading text-lg">
                {barcodeQuery.trim() ? 'Barcode not found in queue' : 'No items in queue'}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                {barcodeQuery.trim() ? 'Try another barcode or check other tabs' : 'All items have been claimed'}
              </p>
            </div>
          ) : (
            shopGroups.map(([shop, shopItems]) => (
              <div key={shop} className="mb-5">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2 px-1">From Shop {shop} ({shopItems.length})</p>
                <div className="space-y-2">
                  {shopItems.map((item) => {
                    const isClaimed = item.claimed_by && item.claimed_by !== worker;
                    const isClaimedByMe = item.claimed_by === worker;
                    const sentDate = item.date_sent_to_jurf ? new Date(item.date_sent_to_jurf) : null;
                    const hoursInTransit = sentDate ? Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60)) : 0;
                    const isOverdue = hoursInTransit > 24;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border-2 p-3 transition-all ${
                          isClaimed
                            ? 'border-gray-200 bg-gray-100 opacity-60'
                            : isOverdue
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
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
                            <p className="text-xs text-gray-500">{item.barcode}</p>
                            <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                              Sent {timeAgo(item.date_sent_to_jurf)} {isOverdue && '— OVERDUE'}
                            </p>
                            {item.problems && item.problems.length > 0 && (
                              <p className="text-xs text-orange-500 mt-0.5">{item.problems.join(', ')}</p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {isClaimed ? (
                              <div className="flex items-center gap-1 text-gray-400">
                                <Lock size={14} />
                                <span className="text-xs font-bold">{item.claimed_by}</span>
                              </div>
                            ) : isClaimedByMe ? (
                              <span className="text-xs font-bold text-blue-500">YOURS</span>
                            ) : (
                              <button
                                onClick={() => handleClaim(item.id)}
                                disabled={actionLoading === item.id}
                                className="px-4 py-3 rounded-xl bg-blue-500 text-white font-heading text-sm active:scale-95 transition-transform disabled:opacity-50 min-h-[48px]"
                              >
                                {actionLoading === item.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  'CLAIM'
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      ) : tab === 'repairs' ? (
        /* ═══ MY REPAIRS TAB ═══ */
        <>
          {filteredRepairs.length === 0 ? (
            <div className="text-center py-10">
              <Wrench size={48} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 font-heading text-lg">
                {barcodeQuery.trim() ? 'Barcode not found in repairs' : 'No active repairs'}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                {barcodeQuery.trim() ? 'Try another barcode or check other tabs' : 'Claim items from the queue to start'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRepairs.map((item) => {
                const isExpanded = expanded === item.id;
                return (
                  <div key={item.id} className="rounded-xl border-2 border-blue-200 bg-white overflow-hidden">
                    {/* Card header */}
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
                        {item.problems && item.problems.length > 0 && (
                          <p className="text-xs text-orange-500 mt-0.5">{item.problems.join(', ')}</p>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                    </button>

                    {/* Expanded repair section */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                        <p className="font-bold text-xs text-gray-500 mb-2">REPAIR NOTES</p>
                        <textarea
                          value={notes[item.id] || ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="What did you do? (e.g. replaced compressor, fixed thermostat)"
                          rows={3}
                          className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400 resize-none mb-3"
                        />

                        {/* ── Spare parts section ── */}
                        <div className="mb-3 border-2 border-dashed border-gray-200 rounded-xl p-3 bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-bold text-xs text-gray-500 flex items-center gap-1.5">
                              <Package size={14} /> SPARE PARTS USED
                            </p>
                            {(partsByItem[item.id]?.length ?? 0) > 0 && (
                              <span className="text-xs text-gray-500">{partsByItem[item.id]!.length}</span>
                            )}
                          </div>

                          {/* List of parts already logged */}
                          {partsByItem[item.id] && partsByItem[item.id]!.length > 0 && (
                            <div className="space-y-2 mb-2">
                              {partsByItem[item.id]!.map((p) => (
                                <div key={p.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={p.photo_url} alt="part" className="w-10 h-10 rounded object-cover bg-gray-100 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">
                                      {partTypeLabel(p.part_type)}
                                      {p.part_label_text ? <span className="text-gray-500 font-normal"> — {p.part_label_text}</span> : null}
                                    </p>
                                    <p className="text-[10px] text-gray-500 truncate">#{p.part_barcode} · {timeAgo(p.date_installed)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Log new part button or inline form */}
                          {partFormItem === item.id ? (
                            <div className="bg-white border-2 border-blue-300 rounded-xl p-3 space-y-3">
                              {/* Photo */}
                              {partPhotoUrl ? (
                                <div className="relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={partPhotoUrl} alt="part" className="w-full max-h-48 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                                  <button
                                    onClick={() => { setPartPhotoUrl(''); }}
                                    type="button"
                                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center"
                                    aria-label="Remove photo"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => partFileRef.current?.click()}
                                  disabled={partUploading}
                                  className="w-full py-4 rounded-xl bg-blue-500 text-white font-heading text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                >
                                  {partUploading ? (
                                    <>
                                      <Loader2 size={18} className="animate-spin" />
                                      {partAnalyzing ? 'Reading label…' : 'Uploading…'}
                                    </>
                                  ) : (
                                    <>
                                      <CameraIcon size={18} /> PHOTO OF PART LABEL
                                    </>
                                  )}
                                </button>
                              )}
                              <input
                                ref={partFileRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handlePartPhoto(f);
                                  e.target.value = '';
                                }}
                                className="hidden"
                              />

                              {partAnalyzing && (
                                <div className="flex items-center gap-1.5 text-xs text-blue-600 font-bold">
                                  <Sparkles size={12} className="animate-pulse" /> Reading label with AI…
                                </div>
                              )}

                              {/* Fields */}
                              <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Part barcode *</label>
                                <input
                                  type="text"
                                  value={partBarcode}
                                  onChange={(e) => setPartBarcode(e.target.value)}
                                  placeholder="Scan or type the barcode"
                                  className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400 mt-1"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Label text</label>
                                <input
                                  type="text"
                                  value={partLabelText}
                                  onChange={(e) => setPartLabelText(e.target.value)}
                                  placeholder="e.g. Compressor LG LDA-204V"
                                  className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400 mt-1"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Part type</label>
                                <select
                                  value={partType}
                                  onChange={(e) => setPartType(e.target.value)}
                                  className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400 mt-1 bg-white"
                                >
                                  {PART_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Notes (optional)</label>
                                <textarea
                                  value={partNotes}
                                  onChange={(e) => setPartNotes(e.target.value)}
                                  rows={2}
                                  placeholder="Any notes about this part"
                                  className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-blue-400 resize-none mt-1"
                                />
                              </div>

                              {partFormError && (
                                <p className="text-red-500 text-xs font-bold">{partFormError}</p>
                              )}

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={closePartForm}
                                  disabled={partSubmitting}
                                  className="flex-1 py-3 rounded-xl bg-gray-200 font-bold text-sm active:scale-95 disabled:opacity-50"
                                >
                                  CANCEL
                                </button>
                                <button
                                  type="button"
                                  onClick={submitPart}
                                  disabled={partSubmitting || partUploading || !partPhotoUrl || !partBarcode.trim()}
                                  className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1"
                                >
                                  {partSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                  SAVE PART
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPartForm(item.id)}
                              className="w-full py-3 rounded-xl bg-white border-2 border-blue-300 text-blue-600 font-heading text-sm flex items-center justify-center gap-1.5 active:scale-95"
                            >
                              <Plus size={16} /> LOG SPARE PART
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => handleRepairDone(item.id)}
                          disabled={actionLoading === item.id}
                          className="w-full py-4 rounded-xl bg-green-500 text-white font-heading text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {actionLoading === item.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Wrench size={20} />
                          )}
                          REPAIR DONE
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ═══ SEND TO SHOP TAB ═══ */
        <>
          {filteredSend.length === 0 ? (
            <div className="text-center py-10">
              <Truck size={48} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 font-heading text-lg">
                {barcodeQuery.trim() ? 'Barcode not found in send queue' : 'No items to send'}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                {barcodeQuery.trim() ? 'Try another barcode or check other tabs' : 'Items appear here after cleaning is done'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSend.map((item) => (
                <div key={item.id} className="rounded-xl border-2 border-green-200 bg-white p-3">
                  <div className="flex items-center gap-3 mb-3">
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
                      <p className="text-xs text-gray-500">{item.barcode} &bull; From Shop {item.shop}</p>
                      {item.repair_notes && (
                        <p className="text-xs text-blue-600 mt-0.5">Notes: {item.repair_notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Destination shop selector */}
                  <p className="font-bold text-xs text-gray-500 mb-2">SEND TO SHOP</p>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {SHOPS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setDestShop((prev) => ({ ...prev, [item.id]: s }))}
                        className={`py-3 rounded-xl font-heading text-lg active:scale-95 transition-all ${
                          destShop[item.id] === s
                            ? 'bg-green-500 text-white ring-2 ring-green-700'
                            : 'bg-gray-200'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handleSendToShop(item.id)}
                    disabled={!destShop[item.id] || actionLoading === item.id}
                    className="w-full py-4 rounded-xl bg-green-500 text-white font-heading text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
                  >
                    {actionLoading === item.id ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Truck size={20} />
                    )}
                    {destShop[item.id] ? `SEND TO SHOP ${destShop[item.id]}` : 'SELECT SHOP FIRST'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
