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
  Check,
  X,
  Pencil,
  Clock,
  Save,
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
  approval_status: string | null;
}

const SHOPS = ['All', 'A', 'B', 'C', 'D', 'E'];
const STATUSES_FILTER = ['All', 'Working', 'Not Working', 'Pending Scrap', 'Repaired', 'Delivered'];
const DATES = ['All Time', 'Today', 'This Week', 'This Month'];

const PRODUCTS = ['Fridge', 'Washer', 'Oven', 'Microwave', 'AC / Cooler', 'Other'];
const BRANDS = ['Samsung', 'LG', 'Bosch', 'Whirlpool', 'Midea', 'Other'];
const ITEM_STATUSES = ['Working', 'Not Working', 'Scrap'];
const PROBLEMS_LIST = ['No power', 'Not cooling', 'Leaking', 'Part missing', 'Other'];

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
  const [worker, setWorker] = useState<{ name: string } | null>(null);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [shopFilter, setShopFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All Time');

  // Expanded
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  // Edit modal
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ product_type: '', brand: '', status: '', problems: [] as string[], shop: '', barcode: '' });
  const [editSaving, setEditSaving] = useState(false);

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
    setAllItems((data || []) as Item[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { if (worker) fetchItems(); }, [worker, fetchItems]);

  // Pending items
  const pending = allItems.filter((i) => i.approval_status === 'pending');
  // Approved items for counts/filters
  const approved = allItems.filter((i) => i.approval_status !== 'pending' && i.approval_status !== 'rejected');

  // Apply filters to approved items
  const filtered = (() => {
    let items = [...approved];
    if (shopFilter !== 'All') items = items.filter((i) => i.shop === shopFilter);
    if (statusFilter !== 'All') items = items.filter((i) => i.status === statusFilter);
    if (dateFilter !== 'All Time') {
      const now = new Date();
      let cutoff: Date;
      if (dateFilter === 'Today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateFilter === 'This Week') cutoff = new Date(now.getTime() - 7 * 86400000);
      else cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      items = items.filter((i) => new Date(i.created_at) >= cutoff);
    }
    return items;
  })();

  const counts = {
    pending: pending.length,
    total: approved.length,
    working: approved.filter((i) => i.status === 'Working').length,
    notWorking: approved.filter((i) => i.status === 'Not Working').length,
    atJurf: approved.filter((i) => i.needs_jurf && i.date_sent_to_jurf).length,
    scrap: approved.filter((i) => i.status === 'Pending Scrap' || i.status === 'Scrap').length,
    repaired: approved.filter((i) => i.status === 'Repaired').length,
    delivered: approved.filter((i) => i.status === 'Delivered').length,
  };

  // Actions
  const approveItem = async (id: string) => {
    await supabase.from('appliance_items').update({ approval_status: 'approved' }).eq('id', id);
    fetchItems(true);
  };

  const rejectItem = async (id: string) => {
    await supabase.from('appliance_items').update({ approval_status: 'rejected' }).eq('id', id);
    fetchItems(true);
  };

  const openEdit = (item: Item) => {
    setEditForm({
      product_type: item.product_type || '',
      brand: item.brand || '',
      status: item.status || '',
      problems: item.problems || [],
      shop: item.shop || '',
      barcode: item.barcode,
    });
    setEditItem(item);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    await supabase.from('appliance_items').update({
      product_type: editForm.product_type,
      brand: editForm.brand,
      status: editForm.status,
      problems: editForm.status === 'Not Working' ? editForm.problems : [],
      shop: editForm.shop,
      barcode: editForm.barcode,
      needs_jurf: editForm.status === 'Not Working',
    }).eq('id', editItem.id);
    setEditItem(null);
    setEditSaving(false);
    fetchItems(true);
  };

  const toggleEditProblem = (p: string) => {
    setEditForm((f) => ({
      ...f,
      problems: f.problems.includes(p) ? f.problems.filter((x) => x !== p) : [...f.problems, p],
    }));
  };

  if (!worker) return null;

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-black text-white px-4 py-3">
        <p className="font-heading text-xl text-yellow">APPLIANCE DASHBOARD</p>
        <p className="text-sm text-gray-400">{worker.name}</p>
      </div>

      {/* ── PENDING APPROVAL ── */}
      {pending.length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={20} className="text-orange-500" />
            <h2 className="font-heading text-xl">PENDING APPROVAL</h2>
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2">
            {pending.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border-2 border-orange-200 p-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{item.product_type} {item.brand ? `— ${item.brand}` : ''}</p>
                    <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop} &bull; {fmtDate(item.date_received || item.created_at)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${STATUS_COLOR[item.status || ''] || 'bg-gray-400'}`}>{item.status}</span>
                      {item.problems && item.problems.length > 0 && (
                        <span className="text-[10px] text-gray-500">{item.problems.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => approveItem(item.id)} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95">
                    <Check size={16} /> APPROVE
                  </button>
                  <button onClick={() => openEdit(item)} className="py-3 px-4 rounded-xl bg-yellow text-black font-bold text-sm flex items-center justify-center gap-1 active:scale-95">
                    <Pencil size={16} /> EDIT
                  </button>
                  <button onClick={() => rejectItem(item.id)} className="py-3 px-4 rounded-xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Count cards */}
      <div className="overflow-x-auto hide-scrollbar px-4 py-4">
        <div className="flex gap-2 min-w-max">
          {[
            { label: 'Pending', value: counts.pending, icon: Clock, color: 'bg-orange-50 text-orange-700' },
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
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {SHOPS.map((s) => (
            <button key={s} onClick={() => setShopFilter(s)} className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${shopFilter === s ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {s === 'All' ? 'All Shops' : `Shop ${s}`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {STATUSES_FILTER.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${statusFilter === s ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {DATES.map((d) => (
            <button key={d} onClick={() => setDateFilter(d)} className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${dateFilter === d ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {d}
            </button>
          ))}
          <button onClick={() => fetchItems(true)} disabled={refreshing} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 active:scale-95 ml-auto" aria-label="Refresh">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-3 pb-1">
        <p className="text-sm text-gray-500">{filtered.length} approved items</p>
      </div>

      {/* Items */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-16 font-heading text-xl">NO ITEMS FOUND</p>
      ) : (
        <div className="px-4 space-y-2">
          {filtered.slice(0, visibleCount).map((item) => {
            const isOpen = expanded === item.id;
            return (
              <button key={item.id} onClick={() => setExpanded(isOpen ? null : item.id)} className="w-full text-left bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{item.product_type || 'Unknown'} {item.brand ? `— ${item.brand}` : ''}</p>
                    <p className="text-xs text-gray-500 truncate">{item.barcode}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${STATUS_COLOR[item.status || ''] || 'bg-gray-400'}`}>{item.status}</span>
                      {item.shop && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Shop {item.shop}</span>}
                      <span className="text-[10px] text-gray-400 ml-auto">{fmtDate(item.date_received || item.created_at)}</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
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
                    ].filter(([, v]) => v).map(([label, val]) => (
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
          {visibleCount < filtered.length && (
            <button onClick={() => setVisibleCount((v) => v + 20)} className="w-full py-4 text-center text-sm font-bold text-gray-500 bg-white rounded-xl border border-gray-200 active:scale-95">
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-2xl">EDIT ITEM</h2>
              <button onClick={() => setEditItem(null)} className="text-gray-400 p-1"><X size={24} /></button>
            </div>

            {/* Shop */}
            <p className="font-bold text-sm mb-2">SHOP</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {['A', 'B', 'C', 'D', 'E'].map((s) => (
                <button key={s} onClick={() => setEditForm((f) => ({ ...f, shop: s }))} className={`py-3 rounded-xl font-heading text-xl active:scale-95 ${editForm.shop === s ? 'bg-black text-yellow' : 'bg-gray-200'}`}>{s}</button>
              ))}
            </div>

            {/* Product */}
            <p className="font-bold text-sm mb-2">PRODUCT</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {PRODUCTS.map((p) => (
                <button key={p} onClick={() => setEditForm((f) => ({ ...f, product_type: p }))} className={`py-3 px-2 rounded-xl text-sm font-bold active:scale-95 ${editForm.product_type === p ? 'bg-black text-yellow' : 'bg-gray-200'}`}>{p}</button>
              ))}
            </div>

            {/* Brand */}
            <p className="font-bold text-sm mb-2">BRAND</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {BRANDS.map((b) => (
                <button key={b} onClick={() => setEditForm((f) => ({ ...f, brand: b }))} className={`py-3 px-2 rounded-xl text-sm font-bold active:scale-95 ${editForm.brand === b ? 'bg-black text-yellow' : 'bg-gray-200'}`}>{b}</button>
              ))}
            </div>

            {/* Status */}
            <p className="font-bold text-sm mb-2">STATUS</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {ITEM_STATUSES.map((s) => {
                const clr = s === 'Working' ? 'bg-green-500 text-white' : s === 'Not Working' ? 'bg-orange-500 text-white' : 'bg-red-500 text-white';
                return (
                  <button key={s} onClick={() => setEditForm((f) => ({ ...f, status: s }))} className={`py-3 rounded-xl font-bold text-sm active:scale-95 ${editForm.status === s ? `${clr} ring-2 ring-offset-1 ring-black` : 'bg-gray-200'}`}>{s}</button>
                );
              })}
            </div>

            {/* Problems */}
            {editForm.status === 'Not Working' && (
              <>
                <p className="font-bold text-sm mb-2">PROBLEMS</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {PROBLEMS_LIST.map((p) => (
                    <button key={p} onClick={() => toggleEditProblem(p)} className={`py-2 px-3 rounded-xl text-sm font-bold active:scale-95 ${editForm.problems.includes(p) ? 'bg-orange-500 text-white' : 'bg-gray-200'}`}>{p}</button>
                  ))}
                </div>
              </>
            )}

            {/* Barcode */}
            <p className="font-bold text-sm mb-2">BARCODE</p>
            <input
              type="text"
              value={editForm.barcode}
              onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
              className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow mb-4"
            />

            <button
              onClick={saveEdit}
              disabled={editSaving}
              className="w-full py-4 rounded-2xl bg-yellow text-black font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {editSaving ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />}
              SAVE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
