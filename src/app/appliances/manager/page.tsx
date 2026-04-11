'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, RefreshCw, Package, CheckCircle, AlertTriangle, Wrench,
  Trash2, Truck, ChevronDown, ChevronUp, Check, X, Pencil, Clock,
  Save, Search, Download, Undo2,
} from 'lucide-react';
import { getItems, updateItem, bulkUpdateItems } from '@/lib/appliance-api';
import SearchableSelect from '../components/SearchableSelect';
import {
  PRODUCT_TYPES,
  BRANDS,
  PRODUCT_OTHER,
  BRAND_OTHER,
  canonicalProductType,
  canonicalBrand,
} from '@/lib/appliance-catalog';

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

const SHOPS_F = ['All', 'A', 'B', 'C', 'D', 'E'];
const STATUSES_F = ['All', 'Working', 'Not Working', 'Pending Scrap', 'Repaired', 'Delivered'];
const DATES_F = ['All Time', 'Today', 'This Week', 'This Month'];
const ITEM_STATUSES = ['Working', 'Not Working', 'Scrap'];
const PROBLEMS_LIST = ['No power', 'Not cooling', 'Leaking', 'Part missing', 'Other'];

const SC: Record<string, string> = {
  Working: 'bg-green-500', 'Not Working': 'bg-orange-500', 'Pending Scrap': 'bg-red-500',
  Repaired: 'bg-blue-500', Delivered: 'bg-gray-500', Scrap: 'bg-red-500',
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
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Search
  const [searchQ, setSearchQ] = useState('');

  // Filters
  const [shopFilter, setShopFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All Time');

  // Tabs for approved/rejected
  const [listTab, setListTab] = useState<'approved' | 'rejected'>('approved');

  // Expanded + pagination
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  // Bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reject confirm
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);

  // Edit modal
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ product_type: '', brand: '', status: '', problems: [] as string[], shop: '', barcode: '' });
  const [editSaving, setEditSaving] = useState(false);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) { router.replace('/appliances'); return; }
    const parsed = JSON.parse(w);
    if (parsed.role !== 'manager') { router.replace('/appliances/select'); return; }
    setWorker(parsed);
  }, [router]);

  const fetchItems = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getItems({ order: { column: 'created_at', ascending: false }, limit: 500 });
      setAllItems(data as Item[]);
    } catch { showToast('err', 'Failed to load items'); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { if (worker) fetchItems(); }, [worker, fetchItems]);

  // Categorize
  const pending = allItems.filter((i) => i.approval_status === 'pending');
  const approved = allItems.filter((i) => i.approval_status !== 'pending' && i.approval_status !== 'rejected');
  const rejected = allItems.filter((i) => i.approval_status === 'rejected');

  // Search results
  const searchResults = searchQ.trim().length >= 2
    ? allItems.filter((i) => i.barcode.toLowerCase().includes(searchQ.trim().toLowerCase()))
    : [];

  // Apply filters
  const listItems = listTab === 'rejected' ? rejected : approved;
  const filtered = (() => {
    let items = [...listItems];
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
    try {
      const result = await updateItem(id, { approval_status: 'approved' });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item approved');
      fetchItems(true);
    } catch { showToast('err', 'Failed to approve. Try again.'); }
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    try {
      const result = await bulkUpdateItems(Array.from(selected), { approval_status: 'approved' });
      if (result.error) throw new Error(result.error);
      showToast('ok', `${selected.size} items approved`);
      setSelected(new Set());
      fetchItems(true);
    } catch { showToast('err', 'Failed to approve. Try again.'); }
  };

  const confirmReject = async () => {
    if (!rejectConfirm) return;
    try {
      const result = await updateItem(rejectConfirm, { approval_status: 'rejected' });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item rejected');
      setRejectConfirm(null);
      fetchItems(true);
    } catch { showToast('err', 'Failed to reject. Try again.'); }
  };

  const undoReject = async (id: string) => {
    try {
      const result = await updateItem(id, { approval_status: 'pending' });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item moved back to pending');
      fetchItems(true);
    } catch { showToast('err', 'Failed to undo. Try again.'); }
  };

  const openEdit = (item: Item) => {
    setEditForm({
      product_type: canonicalProductType(item.product_type),
      brand: canonicalBrand(item.brand),
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
    try {
      const result = await updateItem(editItem.id, {
        product_type: editForm.product_type, brand: editForm.brand, status: editForm.status,
        problems: editForm.status === 'Not Working' ? editForm.problems : [],
        shop: editForm.shop, barcode: editForm.barcode, needs_jurf: editForm.status === 'Not Working',
      });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item updated');
      setEditItem(null);
      fetchItems(true);
    } catch { showToast('err', 'Failed to save. Try again.'); }
    setEditSaving(false);
  };

  const toggleEditProblem = (p: string) => {
    setEditForm((f) => ({ ...f, problems: f.problems.includes(p) ? f.problems.filter((x) => x !== p) : [...f.problems, p] }));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleSelectAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((i) => i.id)));
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['barcode', 'product_type', 'brand', 'status', 'shop', 'date_received', 'approval_status', 'problems'];
    const rows = filtered.map((i) => [
      i.barcode, i.product_type || '', i.brand || '', i.status || '', i.shop || '',
      i.date_received || '', i.approval_status || '', (i.problems || []).join('; '),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `appliances-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!worker) return null;

  // --- Item card renderer ---
  const renderItemCard = (item: Item, actions?: React.ReactNode) => {
    const isOpen = expanded === item.id;
    return (
      <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button onClick={() => setExpanded(isOpen ? null : item.id)} className="w-full text-left flex items-center gap-3 p-3">
          <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
            {item.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{canonicalProductType(item.product_type) || 'Unknown'} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}</p>
            <p className="text-xs text-gray-500 truncate">{item.barcode}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${SC[item.status || ''] || 'bg-gray-400'}`}>{item.status}</span>
              {item.shop && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Shop {item.shop}</span>}
              <span className="text-[10px] text-gray-400 ml-auto">{fmtDate(item.date_received || item.created_at)}</span>
            </div>
          </div>
          {isOpen ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
        </button>
        {isOpen && (
          <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-1.5 text-sm">
            {[
              ['Barcode', item.barcode], ['Product', canonicalProductType(item.product_type)], ['Brand', canonicalBrand(item.brand)],
              ['Status', item.status], ['Problems', item.problems?.join(', ')],
              ['Shop', item.shop ? `Shop ${item.shop}` : null], ['Needs Jurf', item.needs_jurf ? 'Yes' : 'No'],
              ['Date Received', fmtDate(item.date_received)], ['Sent to Jurf', fmtDate(item.date_sent_to_jurf)],
              ['Tested By', item.tested_by], ['Repair Notes', item.repair_notes],
              ['Repair Cost', item.repair_cost ? `AED ${item.repair_cost}` : null],
              ['Destination', item.destination_shop ? `Shop ${item.destination_shop}` : null],
              ['Created By', item.created_by],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-right max-w-[60%]">{val}</span></div>
            ))}
          </div>
        )}
        {actions && <div className="border-t border-gray-100 p-3">{actions}</div>}
      </div>
    );
  };

  return (
    <div className="pb-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-sm font-bold shadow-lg ${toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-black text-white px-4 py-3">
        <p className="font-heading text-xl text-yellow">APPLIANCE DASHBOARD</p>
        <p className="text-sm text-gray-400">{worker.name}</p>
      </div>

      {/* Search bar — sticky */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <div className="relative max-w-lg">
          <input
            type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search by barcode..."
            className="w-full pl-10 pr-10 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
          />
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          {searchQ && (
            <button onClick={() => setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={16} /></button>
          )}
        </div>
        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-2 max-h-[50vh] overflow-y-auto">
            <p className="text-xs text-gray-500">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
            {searchResults.slice(0, 10).map((item) => renderItemCard(item))}
          </div>
        )}
        {searchQ.trim().length >= 2 && searchResults.length === 0 && (
          <p className="text-sm text-gray-400 mt-2">No items match &quot;{searchQ}&quot;</p>
        )}
      </div>

      {/* Pending section */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={20} className="text-orange-500" />
          <h2 className="font-heading text-xl">PENDING APPROVAL</h2>
          <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
          {pending.length > 0 && (
            <label className="ml-auto flex items-center gap-1.5 text-xs font-bold text-gray-500 cursor-pointer">
              <input type="checkbox" checked={selected.size === pending.length && pending.length > 0} onChange={toggleSelectAll} className="w-4 h-4 accent-yellow" />
              Select All
            </label>
          )}
        </div>

        {pending.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No items pending approval</p>
        ) : (
          <div className="space-y-2">
            {pending.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border-2 border-orange-200 p-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-5 h-5 accent-yellow flex-shrink-0" />
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {item.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}</p>
                    <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop} &bull; {fmtDate(item.date_received || item.created_at)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${SC[item.status || ''] || 'bg-gray-400'}`}>{item.status}</span>
                      {item.problems && item.problems.length > 0 && <span className="text-[10px] text-gray-500">{item.problems.join(', ')}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => approveItem(item.id)} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95"><Check size={16} /> APPROVE</button>
                  <button onClick={() => openEdit(item)} className="py-3 px-4 rounded-xl bg-yellow text-black font-bold text-sm flex items-center justify-center gap-1 active:scale-95"><Pencil size={16} /> EDIT</button>
                  <button onClick={() => setRejectConfirm(item.id)} className="py-3 px-4 rounded-xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95"><X size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk approve bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 z-20 bg-white border-t-2 border-green-500 p-4">
          <button onClick={bulkApprove} className="w-full py-4 rounded-2xl bg-green-500 text-white font-heading text-xl flex items-center justify-center gap-2 active:scale-95">
            <Check size={22} strokeWidth={3} /> APPROVE SELECTED ({selected.size})
          </button>
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
            { label: 'At Jurf (sent)', value: counts.atJurf, icon: Wrench, color: 'bg-blue-50 text-blue-700' },
            { label: 'Scrap', value: counts.scrap, icon: Trash2, color: 'bg-red-50 text-red-700' },
            { label: 'Repaired', value: counts.repaired, icon: CheckCircle, color: 'bg-blue-50 text-blue-700' },
            { label: 'Delivered', value: counts.delivered, icon: Truck, color: 'bg-gray-100 text-gray-700' },
          ].map((c) => { const Icon = c.icon; return (
            <div key={c.label} className={`rounded-xl px-4 py-3 min-w-[110px] ${c.color}`}>
              <Icon size={18} className="mb-1" /><p className="font-heading text-2xl">{c.value}</p><p className="text-xs">{c.label}</p>
            </div>
          ); })}
        </div>
      </div>

      {/* Tab: Approved / Rejected */}
      <div className="flex gap-2 px-4 mb-2">
        <button onClick={() => { setListTab('approved'); setVisibleCount(20); }} className={`px-4 py-2 rounded-lg text-sm font-bold ${listTab === 'approved' ? 'bg-black text-yellow' : 'bg-gray-200 text-gray-600'}`}>
          APPROVED ({approved.length})
        </button>
        <button onClick={() => { setListTab('rejected'); setVisibleCount(20); }} className={`px-4 py-2 rounded-lg text-sm font-bold ${listTab === 'rejected' ? 'bg-black text-yellow' : 'bg-gray-200 text-gray-600'}`}>
          REJECTED ({rejected.length})
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {SHOPS_F.map((s) => (<button key={s} onClick={() => setShopFilter(s)} className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${shopFilter === s ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'}`}>{s === 'All' ? 'All Shops' : `Shop ${s}`}</button>))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {STATUSES_F.map((s) => (<button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${statusFilter === s ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'}`}>{s}</button>))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {DATES_F.map((d) => (<button key={d} onClick={() => setDateFilter(d)} className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap active:scale-95 ${dateFilter === d ? 'bg-black text-yellow' : 'bg-white text-gray-600 border border-gray-200'}`}>{d}</button>))}
          <button onClick={() => fetchItems(true)} disabled={refreshing} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 active:scale-95" aria-label="Refresh">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportCSV} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 active:scale-95 flex items-center gap-1 text-sm font-bold" aria-label="Export">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="px-4 pt-3 pb-1">
        <p className="text-sm text-gray-500">{filtered.length} {listTab} items</p>
      </div>

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-16 font-heading text-xl">NO ITEMS FOUND</p>
      ) : (
        <div className="px-4 space-y-2">
          {filtered.slice(0, visibleCount).map((item) =>
            listTab === 'rejected'
              ? renderItemCard(item, (
                  <button onClick={() => undoReject(item.id)} className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95">
                    <Undo2 size={16} /> UNDO — MOVE TO PENDING
                  </button>
                ))
              : renderItemCard(item)
          )}
          {visibleCount < filtered.length && (
            <button onClick={() => setVisibleCount((v) => v + 20)} className="w-full py-4 text-center text-sm font-bold text-gray-500 bg-white rounded-xl border border-gray-200 active:scale-95">
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* Reject confirm modal */}
      {rejectConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            <p className="font-heading text-2xl mb-2">REJECT ITEM?</p>
            <p className="text-gray-500 text-sm mb-6">This item will be moved to rejected.</p>
            <div className="flex gap-3">
              <button onClick={() => setRejectConfirm(null)} className="flex-1 py-4 rounded-2xl bg-gray-200 font-bold text-lg active:scale-95">CANCEL</button>
              <button onClick={confirmReject} className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold text-lg active:scale-95">REJECT</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-2xl">EDIT ITEM</h2>
              <button onClick={() => setEditItem(null)} className="text-gray-400 p-1"><X size={24} /></button>
            </div>
            <p className="font-bold text-sm mb-2">SHOP</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {['A','B','C','D','E'].map((s) => (<button key={s} onClick={() => setEditForm((f) => ({...f, shop: s}))} className={`py-3 rounded-xl font-heading text-xl active:scale-95 ${editForm.shop === s ? 'bg-black text-yellow' : 'bg-gray-200'}`}>{s}</button>))}
            </div>
            <p className="font-bold text-sm mb-2">PRODUCT</p>
            <div className="mb-4">
              <SearchableSelect
                value={editForm.product_type}
                onChange={(v) => setEditForm((f) => ({ ...f, product_type: v }))}
                options={PRODUCT_TYPES}
                placeholder="Search product type..."
                otherLabel={PRODUCT_OTHER}
              />
            </div>
            <p className="font-bold text-sm mb-2">BRAND</p>
            <div className="mb-4">
              <SearchableSelect
                value={editForm.brand}
                onChange={(v) => setEditForm((f) => ({ ...f, brand: v }))}
                options={BRANDS}
                placeholder="Search brand..."
                otherLabel={BRAND_OTHER}
              />
            </div>
            <p className="font-bold text-sm mb-2">STATUS</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {ITEM_STATUSES.map((s) => { const clr = s === 'Working' ? 'bg-green-500 text-white' : s === 'Not Working' ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'; return (
                <button key={s} onClick={() => setEditForm((f) => ({...f, status: s}))} className={`py-3 rounded-xl font-bold text-sm active:scale-95 ${editForm.status === s ? `${clr} ring-2 ring-offset-1 ring-black` : 'bg-gray-200'}`}>{s}</button>
              ); })}
            </div>
            {editForm.status === 'Not Working' && (<>
              <p className="font-bold text-sm mb-2">PROBLEMS</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {PROBLEMS_LIST.map((p) => (<button key={p} onClick={() => toggleEditProblem(p)} className={`py-2 px-3 rounded-xl text-sm font-bold active:scale-95 ${editForm.problems.includes(p) ? 'bg-orange-500 text-white' : 'bg-gray-200'}`}>{p}</button>))}
              </div>
            </>)}
            <p className="font-bold text-sm mb-2">BARCODE</p>
            <input type="text" value={editForm.barcode} onChange={(e) => setEditForm((f) => ({...f, barcode: e.target.value}))} className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow mb-4" />
            <button onClick={saveEdit} disabled={editSaving} className="w-full py-4 rounded-2xl bg-yellow text-black font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
              {editSaving ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />} SAVE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
