'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  getItems,
  getAllRates,
  updateRate,
  type CarpenterItem,
  type CarpenterRate,
  type JobType,
} from '@/lib/carpenter-tracker-api';

const JOB_TYPES: JobType[] = ['USED', 'NEW'];

type DateFilter = 'Today' | 'Yesterday' | 'This Week' | 'All Time';
const DATE_FILTERS: DateFilter[] = ['Today', 'Yesterday', 'This Week', 'All Time'];

function cutoffFor(filter: DateFilter): Date | null {
  const now = new Date();
  if (filter === 'Today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === 'Yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 1);
    return start;
  }
  if (filter === 'This Week') return new Date(now.getTime() - 7 * 86400000);
  return null;
}

function endFor(filter: DateFilter): Date | null {
  if (filter === 'Yesterday') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return null;
}

interface JobTypeSlice {
  count: number;
  total: number;
  by_type: Record<string, { count: number; total: number }>;
}

interface WorkerSummary {
  worker_id: string;
  worker_name: string;
  shop: string;
  count: number;
  total_aed: number;
  by_job_type: Record<JobType, JobTypeSlice>;
  items: CarpenterItem[];
}

function emptySlice(): JobTypeSlice {
  return { count: 0, total: 0, by_type: {} };
}

export default function CarpenterManagerDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [items, setItems] = useState<CarpenterItem[]>([]);
  const [rates, setRates] = useState<CarpenterRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('Today');
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [editRateFor, setEditRateFor] = useState<{ item_type: string; job_type: JobType } | null>(null);
  const [editRateValue, setEditRateValue] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem('carpenter_manager') !== 'ok') {
      router.replace('/carpenter-tracker');
      return;
    }
    setAuthorized(true);
  }, [router]);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [it, rt] = await Promise.all([getItems({ limit: 1000 }), getAllRates()]);
      setItems(it);
      setRates(rt);
    } catch {
      showToast('err', 'Failed to load data');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (authorized) fetchAll();
  }, [authorized, fetchAll]);

  // ── Filter items by date ──────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const start = cutoffFor(dateFilter);
    const end = endFor(dateFilter);
    if (!start) return items;
    return items.filter((i) => {
      const t = new Date(i.created_at).getTime();
      if (t < start.getTime()) return false;
      if (end && t >= end.getTime()) return false;
      return true;
    });
  }, [items, dateFilter]);

  // ── Group by worker, then by job_type ──
  const summaries: WorkerSummary[] = useMemo(() => {
    const byWorker = new Map<string, WorkerSummary>();
    for (const it of filteredItems) {
      let s = byWorker.get(it.worker_id);
      if (!s) {
        s = {
          worker_id: it.worker_id,
          worker_name: it.worker_name,
          shop: it.shop,
          count: 0,
          total_aed: 0,
          by_job_type: { USED: emptySlice(), NEW: emptySlice() },
          items: [],
        };
        byWorker.set(it.worker_id, s);
      }
      // Legacy rows with NULL job_type (shouldn't exist post-migration, but defend).
      const jt: JobType = it.job_type === 'NEW' ? 'NEW' : 'USED';
      s.count += 1;
      s.total_aed += it.rate_at_log;
      const slice = s.by_job_type[jt];
      slice.count += 1;
      slice.total += it.rate_at_log;
      const t = slice.by_type[it.item_type] || { count: 0, total: 0 };
      t.count += 1;
      t.total += it.rate_at_log;
      slice.by_type[it.item_type] = t;
      s.items.push(it);
    }
    return Array.from(byWorker.values()).sort((a, b) => b.total_aed - a.total_aed);
  }, [filteredItems]);

  const grandTotal = useMemo(
    () => filteredItems.reduce((sum, i) => sum + i.rate_at_log, 0),
    [filteredItems],
  );

  const startEditRate = (rate: CarpenterRate) => {
    setEditRateFor({ item_type: rate.item_type, job_type: rate.job_type });
    setEditRateValue(String(rate.rate_aed));
  };

  const cancelEditRate = () => {
    setEditRateFor(null);
    setEditRateValue('');
  };

  const saveRate = async (item_type: string, job_type: JobType) => {
    const n = parseInt(editRateValue, 10);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      showToast('err', 'Enter a number between 0 and 10000');
      return;
    }
    setSavingRate(true);
    const result = await updateRate(item_type, job_type, n);
    setSavingRate(false);
    if (result.error) {
      showToast('err', result.error);
      return;
    }
    showToast('ok', 'Rate updated');
    setEditRateFor(null);
    setEditRateValue('');
    fetchAll(true);
  };

  if (!authorized) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-full overflow-x-hidden bg-[#111] min-h-[calc(100vh-56px)]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-sm font-bold shadow-lg top-[70px] ${
            toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-black px-4 py-4 flex items-center justify-between border-b border-gray-800">
        <div>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">MANAGER</p>
          <p className="font-heading text-2xl text-yellow">CARPENTER TRACKER</p>
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="p-3 rounded-full bg-[#1a1a1a] text-white active:scale-95 disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Date filter */}
      <div className="px-4 py-3 bg-[#0d0d0d] flex gap-2 overflow-x-auto">
        {DATE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setDateFilter(f)}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-heading text-sm transition-colors min-h-[44px] ${
              dateFilter === f ? 'bg-yellow text-black' : 'bg-[#1a1a1a] text-gray-400'
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Summary card */}
      <div className="mx-4 mt-4 p-4 rounded-2xl bg-gradient-to-br from-yellow to-yellow/70 text-black">
        <p className="text-xs uppercase font-bold tracking-wide opacity-70">{dateFilter.toUpperCase()} TOTAL</p>
        <p className="font-heading text-5xl mt-1">AED {grandTotal}</p>
        <p className="text-sm font-bold mt-1">
          {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'} · {summaries.length} carpenter{summaries.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Per-carpenter list */}
      <div className="px-4 mt-6 space-y-3">
        <h2 className="font-heading text-xl text-white mb-2">CARPENTERS</h2>
        {summaries.length === 0 ? (
          <div className="bg-[#1a1a1a] rounded-2xl p-6 text-center">
            <p className="text-gray-500">No items in this period.</p>
          </div>
        ) : (
          summaries.map((s) => {
            const isOpen = expandedWorker === s.worker_id;
            return (
              <div key={s.worker_id} className="bg-[#1a1a1a] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedWorker(isOpen ? null : s.worker_id)}
                  className="w-full px-4 py-4 flex items-center justify-between active:bg-[#222] transition-colors"
                >
                  <div className="text-left">
                    <p className="font-heading text-xl text-white">{s.worker_name.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">SHOP {s.shop} · {s.count} item{s.count === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-heading text-2xl text-yellow">AED {s.total_aed}</p>
                    {isOpen ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-800 px-4 py-4 space-y-4 bg-[#141414]">
                    {/* Breakdown — split by job_type */}
                    <div>
                      <p className="text-xs uppercase font-bold text-gray-500 mb-2">BREAKDOWN</p>
                      <div className="space-y-3">
                        {JOB_TYPES.map((jt) => {
                          const slice = s.by_job_type[jt];
                          if (slice.count === 0) return null;
                          return (
                            <div key={jt}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-heading text-xs text-yellow tracking-wider">{jt}</span>
                                <span className="text-xs font-bold text-white">
                                  {slice.count} item{slice.count === 1 ? '' : 's'} · AED {slice.total}
                                </span>
                              </div>
                              <div className="space-y-1 pl-3 border-l-2 border-gray-800">
                                {Object.entries(slice.by_type)
                                  .sort((a, b) => b[1].total - a[1].total)
                                  .map(([type, agg]) => (
                                    <div key={type} className="flex justify-between text-sm">
                                      <span className="text-gray-300">
                                        {type} <span className="text-gray-500">× {agg.count}</span>
                                      </span>
                                      <span className="font-bold text-white">AED {agg.total}</span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Items with photos */}
                    <div>
                      <p className="text-xs uppercase font-bold text-gray-500 mb-2">ITEMS</p>
                      <div className="space-y-3">
                        {s.items.map((it) => (
                          <div key={it.id} className="bg-[#1a1a1a] rounded-xl p-3">
                            <div className="flex justify-between items-baseline mb-2">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <span className="font-heading text-[10px] text-yellow tracking-wider flex-shrink-0">
                                  {it.job_type === 'NEW' ? 'NEW' : 'USED'}
                                </span>
                                <p className="font-bold text-sm text-white truncate">{it.item_type}</p>
                              </div>
                              <p className="text-yellow font-bold text-sm flex-shrink-0">AED {it.rate_at_log}</p>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">
                              {new Date(it.created_at).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <PhotoThumb url={it.before_photo_url} label="BEFORE" />
                              <PhotoThumb url={it.after_photo_url} label="AFTER" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rates section — grouped by job_type */}
      <div className="px-4 mt-8 space-y-6">
        <div>
          <h2 className="font-heading text-xl text-white mb-2">RATES</h2>
          <p className="text-xs text-gray-500">
            Changing a rate does NOT affect past items — they keep the rate they were logged at.
          </p>
        </div>

        {JOB_TYPES.map((jt) => {
          const rows = rates.filter((r) => r.job_type === jt);
          if (rows.length === 0) return null;
          return (
            <div key={jt}>
              <p className="font-heading text-sm text-yellow tracking-wider mb-2">{jt}</p>
              <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden">
                {rows.map((r, idx) => {
                  const isEditing =
                    editRateFor?.item_type === r.item_type && editRateFor?.job_type === r.job_type;
                  return (
                    <div
                      key={r.id}
                      className={`px-4 py-3 flex items-center justify-between ${
                        idx > 0 ? 'border-t border-gray-800' : ''
                      }`}
                    >
                      <span className="font-bold text-sm text-white flex-1">{r.item_type}</span>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={editRateValue}
                            onChange={(e) => setEditRateValue(e.target.value)}
                            className="w-20 px-2 py-2 text-base text-center bg-[#0d0d0d] border-2 border-yellow rounded-lg text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRate(r.item_type, r.job_type)}
                            disabled={savingRate}
                            className="p-2 rounded-lg bg-green-500 text-white active:scale-95 disabled:opacity-50"
                            aria-label="Save"
                          >
                            {savingRate ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                          </button>
                          <button
                            onClick={cancelEditRate}
                            className="p-2 rounded-lg bg-gray-700 text-white active:scale-95"
                            aria-label="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="font-heading text-lg text-yellow">AED {r.rate_aed}</span>
                          <button
                            onClick={() => startEditRate(r)}
                            className="p-2 rounded-lg bg-[#0d0d0d] text-gray-400 active:scale-95"
                            aria-label="Edit rate"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhotoThumb({ url, label }: { url: string; label: string }) {
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-[#0d0d0d]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-full object-cover" />
      <div className="absolute top-1.5 left-1.5 bg-black/70 text-yellow font-heading text-[10px] px-2 py-0.5 rounded-full">
        {label}
      </div>
    </div>
  );
}
