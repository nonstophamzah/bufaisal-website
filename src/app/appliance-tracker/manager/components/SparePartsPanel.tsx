'use client';

import { useEffect, useState } from 'react';
import { Package, Loader2, Trash2 } from 'lucide-react';
import { getPartsForItem, deletePartsUsage, type SparePartUsage } from '@/lib/appliance-api';

// Keep in sync with jurf/page.tsx PART_TYPES labels
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

/**
 * Shows spare parts installed into a given appliance item.
 * Lazy-loads on mount (so it only fires when the parent is expanded).
 * Allows manager to delete an entry (corrections).
 */
export function SparePartsPanel({ itemId }: { itemId: string }) {
  const [parts, setParts] = useState<SparePartUsage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPartsForItem(itemId)
      .then((p) => { if (!cancelled) setParts(p); })
      .catch(() => { if (!cancelled) setParts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  const handleDelete = async (partId: string) => {
    if (!confirm('Delete this parts entry? The physical part is unaffected — this only removes the log.')) return;
    setDeleting(partId);
    const result = await deletePartsUsage(partId);
    if (!result.error && parts) {
      setParts(parts.filter((p) => p.id !== partId));
    }
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-500">
        <Loader2 size={12} className="animate-spin" /> Loading parts…
      </div>
    );
  }

  if (!parts || parts.length === 0) {
    return null; // Nothing to show when no parts installed
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="font-bold text-xs text-gray-500 flex items-center gap-1.5 mb-2">
        <Package size={12} /> SPARE PARTS INSTALLED ({parts.length})
      </p>
      <div className="space-y-1.5">
        {parts.map((p) => (
          <div key={p.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo_url} alt="part" className="w-10 h-10 rounded object-cover bg-gray-100 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">
                {PART_TYPE_LABELS[p.part_type || 'other'] || 'Part'}
                {p.part_label_text ? <span className="text-gray-500 font-normal"> — {p.part_label_text}</span> : null}
              </p>
              <p className="text-[10px] text-gray-500 truncate">
                #{p.part_barcode} · {p.installed_by} · {fmtDateTime(p.date_installed)}
              </p>
              {p.notes && (
                <p className="text-[10px] text-gray-400 italic truncate">{p.notes}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              disabled={deleting === p.id}
              className="p-2 text-gray-400 active:text-red-500 disabled:opacity-50"
              aria-label="Delete entry"
            >
              {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
