'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
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

const LOCATION_COLORS: Record<string, string> = {
  at_shop: 'bg-green-500',
  sent_to_jurf: 'bg-yellow',
  at_jurf: 'bg-orange-500',
  in_repair: 'bg-orange-500',
  repaired: 'bg-blue-500',
  delivered: 'bg-gray-500',
  sent_to_shop: 'bg-blue-400',
  denied: 'bg-red-500',
};

function conditionLabel(c: string | null) {
  if (!c) return 'Unknown';
  return c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtCurrency(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function ItemCard({
  item,
  idx,
  isExpanded,
  onToggleExpand,
  actions,
}: {
  item: Item;
  idx: number;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      key={item.id}
      className={`rounded-xl border border-gray-200 overflow-hidden ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
    >
      <button
        onClick={() => onToggleExpand(item.id)}
        className="w-full text-left flex items-center gap-3 p-3"
      >
        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
          {item.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">
            {canonicalProductType(item.product_type) || 'Unknown'}{' '}
            {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}
          </p>
          <p className="text-xs text-gray-500 truncate">{item.barcode}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${
                CONDITION_COLORS[item.condition || ''] || 'bg-gray-400'
              }`}
            >
              {conditionLabel(item.condition)}
            </span>
            {item.location_status && item.location_status !== 'at_shop' && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${LOCATION_COLORS[item.location_status] || 'bg-gray-400'} ${
                  item.location_status === 'sent_to_jurf' ? 'text-black' : 'text-white'
                }`}
              >
                {conditionLabel(item.location_status)}
              </span>
            )}
            {item.shop && (
              <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                Shop {item.shop}
              </span>
            )}
            <span className="text-[10px] text-gray-400 ml-auto">
              {fmtDate(item.date_received || item.created_at)}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-1.5 text-sm">
          {[
            ['Barcode', item.barcode],
            ['Product', canonicalProductType(item.product_type)],
            ['Brand', canonicalBrand(item.brand)],
            ['Condition', conditionLabel(item.condition)],
            ['Location', conditionLabel(item.location_status)],
            ['Problems', item.problems?.join(', ')],
            ['Shop', item.shop ? `Shop ${item.shop}` : null],
            ['Needs Jurf', item.needs_jurf ? 'Yes' : 'No'],
            ['Date Received', fmtDate(item.date_received)],
            ['Sent to Jurf', fmtDate(item.date_sent_to_jurf)],
            ['Tested By', item.tested_by],
            ['Repair Notes', item.repair_notes],
            ['Repair Cost', item.repair_cost ? `AED ${fmtCurrency(item.repair_cost)}` : null],
            ['Destination', item.destination_shop ? `Shop ${item.destination_shop}` : null],
            ['Created By', item.created_by],
          ]
            .filter(([, v]) => v)
            .map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-right max-w-[60%]">{val}</span>
              </div>
            ))}
        </div>
      )}
      {actions && <div className="border-t border-gray-100 p-3">{actions}</div>}
    </div>
  );
}
