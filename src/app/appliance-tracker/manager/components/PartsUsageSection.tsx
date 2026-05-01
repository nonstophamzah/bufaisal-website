'use client';

import { useEffect, useState, useCallback } from 'react';
import { Package, Loader2, RefreshCw, Search } from 'lucide-react';
import { getAllPartsUsage, type SparePartUsage } from '@/lib/appliance-api';

const PART_TYPE_LABELS: Record<string, string> = {
  compressor: 'Compressor',
  motor: 'Motor',
  pcb: 'PCB',
  control_board: 'Control Board',
  thermostat: 'Thermostat',
  heating_element: 'Heating Element',
  fan: 'Fan',
  pump: 'Pump',
  drum: 'Drum',
  door_seal: 'Door Seal',
  valve: 'Valve',
  sensor: 'Sensor',
  wiring: 'Wiring',
  other: 'Other',
};

function fmtDateTime(d: string) {
  const date = new Date(d);
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const DATE_RANGES: { value: number; label: string }[] = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 0, label: 'All' },
];

/**
 * Chronological feed of every spare part logged across all items.
 * Lives on the manager dashboard. Filters: date range, worker, search by barcode.
 */
export function PartsUsageSection() {
  const [parts, setParts] = useState<SparePartUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sinceDays, setSinceDays] = useState<number>(7);
  const [workerFilter, setWorkerFilter] = useState<string>('');
  const [query, setQuery] = useState<string>('');

  const fetchParts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getAllPartsUsage({
        since_days: sinceDays || undefined,
        worker: workerFilter || undefined,
        limit: 200,
      });
      setParts(data);
    } catch {
      setParts([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [sinceDays, workerFilter]);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  // Worker dropdown options from data itself (no extra API call)
  const workerOptions = Array.from(new Set(parts.map((p) => p.installed_by))).sort();

  // Client-side filter by barcode query
  const q = query.trim().toLowerCase();
  const filtered = q
    ? parts.filter((p) =>
        p.part_barcode.toLowerCase().includes(q) ||
        (p.part_label_text || '').toLowerCase().includes(q),
      )
    : parts;

  // Summary counts by part type
  const typeCounts: Record<string, number> = {};
  for (const p of parts) {
    const t = p.part_type || 'other';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const topTypes = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return (
    <div className="mx-4 mb-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-blue-500" />
          <h2 className="font-heading text-lg">PARTS USAGE</h2>
          <span className="text-xs text-gray-500">({parts.length})</span>
        </div>
        <button
          onClick={() => fetchParts(true)}
          disabled={refreshing}
          className="p-2 text-gray-500 active:text-gray-900 disabled:opacity-50"
          aria-label="Refresh"
        >
          {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {/* Summary */}
      {topTypes.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto">
          {topTypes.map(([t, count]) => (
            <div key={t} className="flex-shrink-0 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-[10px] font-bold text-blue-600 uppercase">{PART_TYPE_LABELS[t] || t}</p>
              <p className="text-sm font-bold">{count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="px-4 pt-3 pb-3 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setSinceDays(r.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${
                sinceDays === r.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {r.label}
            </button>
          ))}
          {workerOptions.length > 1 && (
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 border-0 focus:outline-none"
            >
              <option value="">All techs</option>
              {workerOptions.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          )}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by barcode or label…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          {parts.length === 0 ? 'No parts logged yet' : 'No parts match your filter'}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          <div className="divide-y divide-gray-100">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo_url} alt="part" className="w-12 h-12 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">
                    {PART_TYPE_LABELS[p.part_type || 'other'] || 'Part'}
                    {p.part_label_text ? <span className="text-gray-500 font-normal"> — {p.part_label_text}</span> : null}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    #{p.part_barcode} · by <span className="font-bold">{p.installed_by}</span> · {fmtDateTime(p.date_installed)}
                  </p>
                  {p.notes && (
                    <p className="text-xs text-gray-400 italic truncate">{p.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
