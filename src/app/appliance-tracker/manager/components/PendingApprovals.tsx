'use client';

import { Check, Pencil, X } from 'lucide-react';
import { Shield } from 'lucide-react';
import { Section } from './Section';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  status: string | null;
  condition: string | null;
  location_status: string | null;
  problems: string[] | null;
  shop: string | null;
  photo_url: string | null;
  needs_jurf: boolean;
  date_received: string | null;
  date_sent_to_jurf: string | null;
  tested_by: string | null;
  repair_notes: string | null;
  repair_cost: number | null;
  destination_shop: string | null;
  created_by: string | null;
  created_at: string;
  approval_status: string | null;
}

const CONDITION_COLORS: Record<string, string> = {
  working: 'bg-green-500',
  not_working: 'bg-red-500',
  pending_scrap: 'bg-orange-500',
  scrap: 'bg-red-700',
  repaired: 'bg-blue-500',
};

function conditionLabel(c: string | null) {
  if (!c) return 'Unknown';
  return c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function PendingApprovals({
  pendingItems,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onApprove,
  onEdit,
  onReject,
}: {
  pendingItems: Item[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onApprove: (id: string) => void;
  onEdit: (item: Item) => void;
  onReject: (id: string) => void;
}) {
  return (
    <Section title={`PENDING APPROVALS (${pendingItems.length})`} icon={Shield} defaultOpen={pendingItems.length > 0}>
      {pendingItems.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">No items pending approval</p>
      ) : (
        <>
          {pendingItems.length > 1 && (
            <label className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={selectedIds.size === pendingItems.length}
                onChange={onSelectAll}
                className="w-4 h-4 accent-yellow"
              />
              Select All ({pendingItems.length})
            </label>
          )}
          <div className="space-y-2">
            {pendingItems.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border-2 border-orange-200 p-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggleSelect(item.id)}
                    className="w-5 h-5 accent-yellow flex-shrink-0"
                  />
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
                    <p className="text-xs text-gray-500">
                      {item.barcode} &bull; Shop {item.shop} &bull; {fmtDate(item.date_received || item.created_at)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${
                          CONDITION_COLORS[item.condition || ''] || 'bg-gray-400'
                        }`}
                      >
                        {conditionLabel(item.condition)}
                      </span>
                      {item.problems && item.problems.length > 0 && (
                        <span className="text-[10px] text-gray-500">{item.problems.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onApprove(item.id)}
                    className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"
                  >
                    <Check size={16} /> APPROVE
                  </button>
                  <button
                    onClick={() => onEdit(item)}
                    className="py-3 px-4 rounded-xl bg-yellow text-black font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"
                  >
                    <Pencil size={16} /> EDIT
                  </button>
                  <button
                    onClick={() => onReject(item.id)}
                    className="py-3 px-4 rounded-xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
