'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  RefreshCw,
  Package,
  CheckCircle,
  AlertTriangle,
  Wrench,
  Trash2,
  Truck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  status: string | null;
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
}

const SHOPS = ['All', 'A', 'B', 'C', 'D', 'E'];
const STATUSES = ['All', 'Working', 'Not Working', 'Pending Scrap', 'Repaired', 'Delivered'];
const DATES = ['All Time', 'Today', 'This Week', 'This Month'];

const STATUS_COLOR: Record<string, string> = {
  Working: 'bg-green-500',
  'Not Working': 'bg-orange-500',
  'Pending Scrap': 'bg-red-500',
  Repaired: 'bg-blue-500',
  Delivered: 'bg-gray-500',
  Scrap: 'bg-red-500',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ManagerDashboard() {
  const router = useRouter();
  const [worker, setWorker] = useState<{ name: string; role: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [shopFilter, setShopFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All Time');

  // Expanded card
  const [expanded, setExpanded] = useState<string | null>(null);

  // Pagination
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    const parsed = JSON.parse(w);
    if (parsed.role !== 'manager') { router.replace('/appliances/select'); return; }
    setWorker(parsed);
  }, [router]);

  const fetchItems = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data } = await supabase
      .from('appliance_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    const fetched = (data || []) as Item[];
    setAllItems(fetched);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (worker) fetchItems();
  }, [worker, fetchItems]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allItems];

    if (shopFilter !== 'All') {
      filtered = filtered.filter((i) => i.shop === shopFilter);
    }

    if (statusFilter !== 'All') {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    if (dateFilter !== 'All Time') {
      const now = new Date();
      let cutoff: Date;
      if (dateFilter === 'Today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === 'This Week') {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      filtered = filtered.filter((i) => new Date(i.created_at) >= cutoff);
    }

    setItems(filtered);
    setVisibleCount(20);
  }, [allItems, shopFilter, statusFilter, dateFilter]);

  // Counts
  const counts = {
    total: allItems.length,
    working: allItems.filter((i) => i.status === 'Working').length,
    notWorking: allItems.filter((i) => i.status === 'Not Working').length,
    atJurf: allItems.filter((i) => i.needs_jurf && i.date_sent_to_jurf).length,
    scrap: allItems.filter((i) => i.status === 'Pending Scrap' || i.status === 'Scrap').length,
    repaired: allItems.filter((i) => i.status === 'Repaired').length,
    delivered: allItems.filter((i) => i.status === 'Delivered').length,
  };

  if (!worker) return null;

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-black text-white px-4 py-3">
        <p className="font-heading text-xl text-yellow">APPLIANCE DASHBOARD</p>
        <p className="text-sm text-gray-400">{worker.name}</p>
      </div>

      {/* Count cards */}
      <div className="overflow-x-auto hide-scrollbar px-4 py-4">
        <div className="flex gap-2 min-w-max">
          {[
            { label: 'Total', value: counts.total, icon: Package, color: 'bg-gray-100 text-black' },
            { label: 'Working', value: counts.working, icon: CheckCircle, color: 'bg-green-50 text-green-700' },
            { label: 'Not Working', value: counts.notWorking, icon: AlertTriangle, color: 'bg-orange-50 text-orange-700' },
            { label: 'At Jurf', value: counts.atJurf, icon: Wrench, color: 'bg-blue-50 text-blue-700' },
            { label: 'Scrap', value: counts.scrap, icon: Trash2, color: 'bg-red-50 text-red-700' },
            { label: 'Repaired', value: counts.repaired, icon: CheckCircle, color: 'bg-blue-50 text-blue-700' },
            { label: 'Delivered', value: counts.delivered, icon: Truck, color: 'bg-gray-100 text-gray-700' },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className={`rounded-xl px-4 py-3 min-w-[110px] ${c.color}`}>
                <Icon size={18} className="mb-1" />
                <p className="font-heading text-2xl">{c.value}</p>
                <p className="text-xs">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-14 z-10 bg-gray-50 border-b border-gray-200 px-4 py-3 space-y-2">
        {/* Shop */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {SHOPS.map((s) => (
            <button
              key={s}
              onClick={() => setShopFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${
                shopFilter === s ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {s === 'All' ? 'All Shops' : `Shop ${s}`}
            </button>
          ))}
        </div>
        {/* Status */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${
                statusFilter === s ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* Date */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {DATES.map((d) => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${
                dateFilter === d ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => fetchItems(true)}
            disabled={refreshing}
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 active:scale-95 ml-auto"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-sm text-gray-500">{items.length} items</p>
      </div>

      {/* Items */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 py-16 font-heading text-xl">NO ITEMS FOUND</p>
      ) : (
        <div className="px-4 space-y-2">
          {items.slice(0, visibleCount).map((item) => {
            const isOpen = expanded === item.id;
            const statusColor = STATUS_COLOR[item.status || ''] || 'bg-gray-400';

            return (
              <button
                key={item.id}
                onClick={() => setExpanded(isOpen ? null : item.id)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Photo */}
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {item.product_type || 'Unknown'} {item.brand ? `— ${item.brand}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{item.barcode}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${statusColor}`}>
                        {item.status}
                      </span>
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

                  {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>

                {/* Expanded details */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-1.5 text-sm">
                    {[
                      ['Barcode', item.barcode],
                      ['Product', item.product_type],
                      ['Brand', item.brand],
                      ['Status', item.status],
                      ['Problems', item.problems?.join(', ')],
                      ['Shop', item.shop ? `Shop ${item.shop}` : null],
                      ['Needs Jurf', item.needs_jurf ? 'Yes' : 'No'],
                      ['Date Received', fmtDate(item.date_received)],
                      ['Sent to Jurf', fmtDate(item.date_sent_to_jurf)],
                      ['Tested By', item.tested_by],
                      ['Repair Notes', item.repair_notes],
                      ['Repair Cost', item.repair_cost ? `AED ${item.repair_cost}` : null],
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
              </button>
            );
          })}

          {/* Load more */}
          {visibleCount < items.length && (
            <button
              onClick={() => setVisibleCount((v) => v + 20)}
              className="w-full py-4 text-center text-sm font-bold text-gray-500 bg-white rounded-xl border border-gray-200 active:scale-95"
            >
              Load more ({items.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
