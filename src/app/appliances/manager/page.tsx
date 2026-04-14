'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, RefreshCw, Package, ChevronDown, ChevronUp, Check, X, Pencil, Clock,
  Save, Search, Download, Undo2, AlertCircle, TrendingUp, TrendingDown,
  Minus, DollarSign, BarChart3, Activity, Shield, Grid3X3,
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

const SHOPS_F = ['All', 'A', 'B', 'C', 'D', 'E'];
const STATUSES_F = ['All', 'Working', 'Not Working', 'Pending Scrap', 'Repaired', 'In Transit', 'At Jurf', 'Delivered'];
const DATES_F = ['All Time', 'Today', 'This Week', 'This Month'];
const ITEM_STATUSES = ['Working', 'Not Working', 'Scrap'];
const PROBLEMS_LIST = ['No power', 'Not cooling', 'Leaking', 'Part missing', 'Other'];

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

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Collapsible Section wrapper ──
function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left min-h-[48px]"
      >
        <Icon size={16} className="text-yellow flex-shrink-0" />
        <span className="font-heading text-sm text-gray-300 flex-1">{title}</span>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Metric Card ──
function MetricCard({ label, value, trend, color }: {
  label: string;
  value: number;
  trend?: number;
  color?: string;
}) {
  return (
    <div className={`rounded-xl p-3 border border-gray-800 ${color || 'bg-dark'}`}>
      <p className="font-heading text-3xl text-white">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-gray-400">{label}</p>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 text-xs font-bold ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}
          </div>
        )}
        {trend === 0 && (
          <div className="flex items-center gap-0.5 text-xs text-gray-500">
            <Minus size={12} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  const router = useRouter();
  const [worker, setWorker] = useState<{ name: string } | null>(null);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [sheetsExporting, setSheetsExporting] = useState(false);

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
      setLastRefreshed(new Date());
    } catch { showToast('err', 'Failed to load items'); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { if (worker) fetchItems(); }, [worker, fetchItems]);

  // ══════════════════════════════════════
  //  COMPUTED DATA (all client-side)
  // ══════════════════════════════════════

  const pending = allItems.filter((i) => i.approval_status === 'pending');
  const approved = allItems.filter((i) => i.approval_status !== 'pending' && i.approval_status !== 'rejected');
  const rejected = allItems.filter((i) => i.approval_status === 'rejected');

  // Search
  const searchResults = searchQ.trim().length >= 2
    ? allItems.filter((i) => i.barcode.toLowerCase().includes(searchQ.trim().toLowerCase()))
    : [];

  // Filters
  const listItems = listTab === 'rejected' ? rejected : approved;
  const filtered = useMemo(() => {
    let items = [...listItems];
    if (shopFilter !== 'All') items = items.filter((i) => i.shop === shopFilter);
    const conditionFilterMap: Record<string, string> = {
      Working: 'working', 'Not Working': 'not_working', 'Pending Scrap': 'pending_scrap', Repaired: 'repaired',
    };
    if (statusFilter === 'In Transit') items = items.filter((i) => i.location_status === 'sent_to_jurf');
    else if (statusFilter === 'At Jurf') items = items.filter((i) => i.location_status === 'at_jurf');
    else if (statusFilter === 'Delivered') items = items.filter((i) => i.location_status === 'delivered');
    else if (statusFilter !== 'All') {
      const cond = conditionFilterMap[statusFilter];
      if (cond) items = items.filter((i) => i.condition === cond);
    }
    if (dateFilter !== 'All Time') {
      const now = new Date();
      let cutoff: Date;
      if (dateFilter === 'Today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateFilter === 'This Week') cutoff = new Date(now.getTime() - 7 * 86400000);
      else cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      items = items.filter((i) => new Date(i.created_at) >= cutoff);
    }
    return items;
  }, [listItems, shopFilter, statusFilter, dateFilter]);

  // Overdue
  const overdueItems = approved.filter((i) => {
    if (i.location_status !== 'sent_to_jurf' || !i.date_sent_to_jurf) return false;
    return (Date.now() - new Date(i.date_sent_to_jurf).getTime()) > 24 * 60 * 60 * 1000;
  });

  // Shop counts (at_shop only)
  const shopCounts: Record<string, number> = {};
  for (const item of approved) {
    if (item.location_status === 'at_shop' && item.shop) {
      shopCounts[item.shop] = (shopCounts[item.shop] || 0) + 1;
    }
  }
  const maxShopCount = Math.max(...Object.values(shopCounts), 1);

  // Pipeline metrics
  const metrics = useMemo(() => {
    const totalActive = approved.filter((i) => i.condition !== 'scrap' && i.location_status !== 'delivered').length;
    const inRepair = approved.filter((i) => i.location_status === 'at_jurf' || i.location_status === 'in_repair').length;
    const readyToShip = approved.filter((i) => i.condition === 'repaired' && i.location_status !== 'delivered').length;
    const delivered = approved.filter((i) => i.location_status === 'delivered').length;
    const working = approved.filter((i) => i.condition === 'working').length;
    const notWorking = approved.filter((i) => i.condition === 'not_working').length;
    const pendingScrap = approved.filter((i) => i.condition === 'pending_scrap').length;
    const scrap = approved.filter((i) => i.condition === 'scrap').length;
    return { totalActive, inRepair, readyToShip, delivered, working, notWorking, pendingScrap, scrap };
  }, [approved]);

  // Trends (today vs yesterday by date_received)
  const trends = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const isToday = (d: string | null) => d && new Date(d) >= today;
    const isYesterday = (d: string | null) => d && new Date(d) >= yesterday && new Date(d) < today;

    const todayItems = approved.filter((i) => isToday(i.date_received));
    const yesterdayItems = approved.filter((i) => isYesterday(i.date_received));

    const todayCount = todayItems.length;
    const yesterdayCount = yesterdayItems.length;
    const intakeDelta = todayCount - yesterdayCount;

    return { todayCount, yesterdayCount, intakeDelta };
  }, [approved]);

  // Repair cost metrics
  const costMetrics = useMemo(() => {
    const itemsWithCost = approved.filter((i) => i.repair_cost && i.repair_cost > 0);
    const totalCost = itemsWithCost.reduce((sum, i) => sum + (i.repair_cost || 0), 0);
    const avgCost = itemsWithCost.length > 0 ? totalCost / itemsWithCost.length : 0;
    const sorted = [...itemsWithCost].sort((a, b) => (b.repair_cost || 0) - (a.repair_cost || 0));
    const mostExpensive = sorted[0] || null;
    return { totalCost, avgCost, mostExpensive, count: itemsWithCost.length };
  }, [approved]);

  // Intake velocity (last 7 days)
  const intakeVelocity = useMemo(() => {
    const days: { date: Date; dayName: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const count = allItems.filter((item) => {
        if (!item.date_received) return false;
        const rd = new Date(item.date_received);
        return rd >= d && rd < nextD;
      }).length;
      days.push({ date: d, dayName: DAY_NAMES[d.getDay()], count });
    }
    return days;
  }, [allItems]);
  const maxIntake = Math.max(...intakeVelocity.map((d) => d.count), 1);

  // ══════════════════════════════════════
  //  ACTIONS (preserved exactly)
  // ══════════════════════════════════════

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
    const condToLabel: Record<string, string> = { working: 'Working', not_working: 'Not Working', scrap: 'Scrap', pending_scrap: 'Not Working', repaired: 'Working' };
    const label = condToLabel[item.condition || ''] || item.status || '';
    setEditForm({
      product_type: canonicalProductType(item.product_type),
      brand: canonicalBrand(item.brand),
      status: label,
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
      const conditionMap: Record<string, string> = { Working: 'working', 'Not Working': 'not_working', Scrap: 'scrap' };
      const result = await updateItem(editItem.id, {
        product_type: editForm.product_type, brand: editForm.brand, status: editForm.status,
        condition: conditionMap[editForm.status] || editForm.status.toLowerCase().replace(/ /g, '_'),
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

  const exportCSV = () => {
    const headers = ['barcode', 'product_type', 'brand', 'condition', 'location_status', 'status', 'shop', 'date_received', 'date_sent_to_jurf', 'approval_status', 'problems'];
    const rows = filtered.map((i) => [
      i.barcode, i.product_type || '', i.brand || '', i.condition || '', i.location_status || '',
      i.status || '', i.shop || '', i.date_received || '', i.date_sent_to_jurf || '',
      i.approval_status || '', (i.problems || []).join('; '),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `appliances-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportToSheets = async () => {
    setSheetsExporting(true);
    try {
      const res = await fetch('/api/export-to-sheets', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      showToast('ok', `Exported ${data.itemCount} items to Google Sheets`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Export failed');
    }
    setSheetsExporting(false);
  };

  // ══════════════════════════════════════
  //  ITEM CARD RENDERER (preserved)
  // ══════════════════════════════════════

  const renderItemCard = (item: Item, idx: number, actions?: React.ReactNode) => {
    const isOpen = expanded === item.id;
    return (
      <div key={item.id} className={`rounded-xl border border-gray-200 overflow-hidden ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
        <button onClick={() => setExpanded(isOpen ? null : item.id)} className="w-full text-left flex items-center gap-3 p-3">
          <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
            {item.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{canonicalProductType(item.product_type) || 'Unknown'} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}</p>
            <p className="text-xs text-gray-500 truncate">{item.barcode}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${CONDITION_COLORS[item.condition || ''] || 'bg-gray-400'}`}>
                {conditionLabel(item.condition)}
              </span>
              {item.location_status && item.location_status !== 'at_shop' && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${LOCATION_COLORS[item.location_status] || 'bg-gray-400'} ${item.location_status === 'sent_to_jurf' ? 'text-black' : 'text-white'}`}>
                  {conditionLabel(item.location_status)}
                </span>
              )}
              {item.shop && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Shop {item.shop}</span>}
              <span className="text-[10px] text-gray-400 ml-auto">{fmtDate(item.date_received || item.created_at)}</span>
            </div>
          </div>
          {isOpen ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
        </button>
        {isOpen && (
          <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-1.5 text-sm">
            {[
              ['Barcode', item.barcode], ['Product', canonicalProductType(item.product_type)], ['Brand', canonicalBrand(item.brand)],
              ['Condition', conditionLabel(item.condition)], ['Location', conditionLabel(item.location_status)],
              ['Problems', item.problems?.join(', ')],
              ['Shop', item.shop ? `Shop ${item.shop}` : null], ['Needs Jurf', item.needs_jurf ? 'Yes' : 'No'],
              ['Date Received', fmtDate(item.date_received)], ['Sent to Jurf', fmtDate(item.date_sent_to_jurf)],
              ['Tested By', item.tested_by], ['Repair Notes', item.repair_notes],
              ['Repair Cost', item.repair_cost ? `AED ${fmtCurrency(item.repair_cost)}` : null],
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

  if (!worker) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ══════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════

  return (
    <div className="pb-24 max-w-full overflow-x-hidden bg-[#111]">
      {/* Toast */}
      {toast && (
        <div className={`fixed left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-sm font-bold shadow-lg top-[calc(env(safe-area-inset-top)+70px)] ${toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* ═══ S1: FIXED HEADER ═══ */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-gray-800 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-lg text-yellow">OPERATIONS DASHBOARD</h1>
            <p className="text-xs text-gray-500">
              {worker.name}
              {lastRefreshed && <> &middot; Updated {fmtTime(lastRefreshed)}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full">
              {allItems.length}
            </span>
            <button
              onClick={exportToSheets}
              disabled={sheetsExporting}
              className="px-3 py-2 rounded-lg bg-yellow text-black font-bold text-xs flex items-center gap-1.5 active:scale-95 min-h-[40px] disabled:opacity-50"
            >
              {sheetsExporting ? <Loader2 size={14} className="animate-spin" /> : <Grid3X3 size={14} />}
              Sheets
            </button>
            <button
              onClick={() => fetchItems(true)}
              disabled={refreshing}
              className="p-2 rounded-lg bg-gray-800 text-gray-300 active:scale-95 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Spacer for fixed header (60px + safe area) */}
      <div className="h-[calc(env(safe-area-inset-top)+60px)]" />

      {/* ═══ S2: CRITICAL ALERTS ═══ */}
      {(overdueItems.length > 0 || pending.length > 0) && (
        <div className="px-4 pt-4 space-y-2">
          {overdueItems.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/15 border border-red-500/30">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-400">{overdueItems.length} OVERDUE AT JURF</p>
                <p className="text-xs text-red-400/70">Sent over 24 hours ago, not yet received</p>
              </div>
              <span className="font-heading text-2xl text-red-400">{overdueItems.length}</span>
            </div>
          )}
          {pending.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/15 border border-orange-500/30">
              <Clock size={20} className="text-orange-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-400">{pending.length} PENDING APPROVAL</p>
                <p className="text-xs text-orange-400/70">Items waiting for manager review</p>
              </div>
              <span className="font-heading text-2xl text-orange-400">{pending.length}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ S3: KEY METRICS GRID ═══ */}
      <Section title="PIPELINE METRICS" icon={Activity} defaultOpen={true}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard label="Total Active" value={metrics.totalActive} trend={trends.intakeDelta} />
          <MetricCard label="In Repair" value={metrics.inRepair} color="bg-dark" />
          <MetricCard label="Ready to Ship" value={metrics.readyToShip} color="bg-dark" />
          <MetricCard label="Delivered" value={metrics.delivered} color="bg-dark" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <MetricCard label="Working" value={metrics.working} />
          <MetricCard label="Not Working" value={metrics.notWorking} />
          <MetricCard label="Pending Scrap" value={metrics.pendingScrap} />
          <MetricCard label="Scrap" value={metrics.scrap} />
        </div>
      </Section>

      {/* ═══ S4: SHOP BREAKDOWN ═══ */}
      <Section title="SHOP BREAKDOWN" icon={BarChart3} defaultOpen={true}>
        <div className="space-y-2">
          {['A', 'B', 'C', 'D', 'E'].map((s) => {
            const count = shopCounts[s] || 0;
            const pct = maxShopCount > 0 ? (count / maxShopCount) * 100 : 0;
            const isActive = shopFilter === s;
            return (
              <button
                key={s}
                onClick={() => setShopFilter(isActive ? 'All' : s)}
                className={`w-full flex items-center gap-3 group min-h-[44px] ${isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
              >
                <span className={`font-heading text-lg w-8 text-right ${isActive ? 'text-yellow' : 'text-gray-400'}`}>{s}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-7 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isActive ? 'bg-yellow' : 'bg-yellow/60'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className={`font-heading text-lg w-8 ${isActive ? 'text-yellow' : 'text-white'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ═══ S5: REPAIR COST TRACKER ═══ */}
      <Section title="REPAIR COSTS" icon={DollarSign} defaultOpen={true}>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl p-3 border border-gray-800 bg-dark">
            <p className="text-xs text-gray-400 mb-1">Total Spent</p>
            <p className="font-heading text-xl text-white">AED {fmtCurrency(costMetrics.totalCost)}</p>
            <p className="text-[10px] text-gray-500 mt-1">{costMetrics.count} repairs</p>
          </div>
          <div className="rounded-xl p-3 border border-gray-800 bg-dark">
            <p className="text-xs text-gray-400 mb-1">Avg / Item</p>
            <p className="font-heading text-xl text-white">AED {fmtCurrency(Math.round(costMetrics.avgCost))}</p>
          </div>
          <div className="rounded-xl p-3 border border-gray-800 bg-dark">
            <p className="text-xs text-gray-400 mb-1">Most Expensive</p>
            <p className="font-heading text-xl text-white">
              {costMetrics.mostExpensive ? `AED ${fmtCurrency(costMetrics.mostExpensive.repair_cost || 0)}` : '—'}
            </p>
            {costMetrics.mostExpensive && (
              <p className="text-[10px] text-gray-500 mt-1 truncate">{costMetrics.mostExpensive.barcode}</p>
            )}
          </div>
        </div>
      </Section>

      {/* ═══ S6: INTAKE VELOCITY ═══ */}
      <Section title="7-DAY INTAKE" icon={TrendingUp} defaultOpen={true}>
        <div className="flex items-end gap-1.5 h-28">
          {intakeVelocity.map((day) => {
            const heightPct = maxIntake > 0 ? (day.count / maxIntake) * 100 : 0;
            const isToday = day.date.toDateString() === new Date().toDateString();
            return (
              <div key={day.date.toISOString()} className="flex-1 flex flex-col items-center gap-1">
                <span className={`text-xs font-bold ${day.count > 0 ? 'text-white' : 'text-gray-600'}`}>
                  {day.count || ''}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 min-h-[2px] ${
                      day.count > 0 ? (isToday ? 'bg-yellow' : 'bg-yellow/50') : 'bg-gray-800'
                    }`}
                    style={{ height: `${Math.max(heightPct, 3)}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold ${isToday ? 'text-yellow' : 'text-gray-500'}`}>
                  {day.dayName}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-gray-500">Today: <span className="text-white font-bold">{trends.todayCount}</span></span>
          <span className="text-gray-500">Yesterday: <span className="text-white font-bold">{trends.yesterdayCount}</span></span>
          <span className={`font-bold ${trends.intakeDelta > 0 ? 'text-green-400' : trends.intakeDelta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {trends.intakeDelta > 0 ? '+' : ''}{trends.intakeDelta} delta
          </span>
        </div>
      </Section>

      {/* ═══ S7: ITEMS TABLE ═══ */}
      <Section title="ITEMS LIST" icon={Package} defaultOpen={true}>
        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search by barcode..."
            className="w-full pl-10 pr-10 py-3 text-base border-2 border-gray-700 bg-gray-900 text-white rounded-xl focus:outline-none focus:border-yellow placeholder:text-gray-600"
          />
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          {searchQ && (
            <button onClick={() => setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><X size={16} /></button>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mb-3 space-y-2 max-h-[50vh] overflow-y-auto bg-white rounded-xl p-3">
            <p className="text-xs text-gray-500">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
            {searchResults.slice(0, 10).map((item, idx) => renderItemCard(item, idx))}
          </div>
        )}
        {searchQ.trim().length >= 2 && searchResults.length === 0 && (
          <p className="text-sm text-gray-500 mb-3">No items match &quot;{searchQ}&quot;</p>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setListTab('approved'); setVisibleCount(20); }} className={`px-4 py-2 rounded-lg text-sm font-bold min-h-[44px] ${listTab === 'approved' ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'}`}>
            APPROVED ({approved.length})
          </button>
          <button onClick={() => { setListTab('rejected'); setVisibleCount(20); }} className={`px-4 py-2 rounded-lg text-sm font-bold min-h-[44px] ${listTab === 'rejected' ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'}`}>
            REJECTED ({rejected.length})
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-2 mb-3">
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
            {SHOPS_F.map((s) => (
              <button key={s} onClick={() => setShopFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 min-h-[36px] ${shopFilter === s ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'}`}>
                {s === 'All' ? 'All Shops' : `Shop ${s}`}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
            {STATUSES_F.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 min-h-[36px] ${statusFilter === s ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
            {DATES_F.map((d) => (
              <button key={d} onClick={() => setDateFilter(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 min-h-[36px] ${dateFilter === d ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'}`}>
                {d}
              </button>
            ))}
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 active:scale-95 flex items-center gap-1 text-xs font-bold min-h-[36px]">
              <Download size={12} /> CSV
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-2">{filtered.length} {listTab} items</p>

        {/* Items */}
        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-10 font-heading text-lg">NO ITEMS FOUND</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.slice(0, visibleCount).map((item, idx) =>
              listTab === 'rejected'
                ? renderItemCard(item, idx, (
                    <button onClick={() => undoReject(item.id)} className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]">
                      <Undo2 size={16} /> UNDO — MOVE TO PENDING
                    </button>
                  ))
                : renderItemCard(item, idx)
            )}
            {visibleCount < filtered.length && (
              <button onClick={() => setVisibleCount((v) => v + 20)} className="w-full py-4 text-center text-sm font-bold text-gray-400 bg-gray-800 rounded-xl active:scale-95">
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </Section>

      {/* ═══ S8: PENDING APPROVALS ═══ */}
      <Section title={`PENDING APPROVALS (${pending.length})`} icon={Shield} defaultOpen={pending.length > 0}>
        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No items pending approval</p>
        ) : (
          <>
            {pending.length > 1 && (
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer mb-3">
                <input type="checkbox" checked={selected.size === pending.length} onChange={toggleSelectAll} className="w-4 h-4 accent-yellow" />
                Select All ({pending.length})
              </label>
            )}
            <div className="space-y-2">
              {pending.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border-2 border-orange-200 p-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-5 h-5 accent-yellow flex-shrink-0" />
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {item.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{canonicalProductType(item.product_type)} {item.brand ? `— ${canonicalBrand(item.brand)}` : ''}</p>
                      <p className="text-xs text-gray-500">{item.barcode} &bull; Shop {item.shop} &bull; {fmtDate(item.date_received || item.created_at)}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${CONDITION_COLORS[item.condition || ''] || 'bg-gray-400'}`}>{conditionLabel(item.condition)}</span>
                        {item.problems && item.problems.length > 0 && <span className="text-[10px] text-gray-500">{item.problems.join(', ')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => approveItem(item.id)} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"><Check size={16} /> APPROVE</button>
                    <button onClick={() => openEdit(item)} className="py-3 px-4 rounded-xl bg-yellow text-black font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"><Pencil size={16} /> EDIT</button>
                    <button onClick={() => setRejectConfirm(item.id)} className="py-3 px-4 rounded-xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"><X size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Bulk approve bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-black border-t-2 border-green-500 p-4">
          <button onClick={bulkApprove} className="w-full py-4 rounded-2xl bg-green-500 text-white font-heading text-xl flex items-center justify-center gap-2 active:scale-95">
            <Check size={22} strokeWidth={3} /> APPROVE SELECTED ({selected.size})
          </button>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Reject confirm */}
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-0 sm:px-6">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
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
              <SearchableSelect value={editForm.product_type} onChange={(v) => setEditForm((f) => ({ ...f, product_type: v }))} options={PRODUCT_TYPES} placeholder="Search product type..." otherLabel={PRODUCT_OTHER} />
            </div>
            <p className="font-bold text-sm mb-2">BRAND</p>
            <div className="mb-4">
              <SearchableSelect value={editForm.brand} onChange={(v) => setEditForm((f) => ({ ...f, brand: v }))} options={BRANDS} placeholder="Search brand..." otherLabel={BRAND_OTHER} />
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
                {PROBLEMS_LIST.map((p) => (<button key={p} onClick={() => toggleEditProblem(p)} className={`py-2.5 px-3 rounded-xl text-sm font-bold active:scale-95 min-h-[44px] ${editForm.problems.includes(p) ? 'bg-orange-500 text-white' : 'bg-gray-200'}`}>{p}</button>))}
              </div>
            </>)}
            <p className="font-bold text-sm mb-2">BARCODE</p>
            <input type="text" value={editForm.barcode} onChange={(e) => setEditForm((f) => ({...f, barcode: e.target.value}))} className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow mb-4" />
            <button onClick={saveEdit} disabled={editSaving} className="w-full py-4 rounded-2xl bg-yellow text-black font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
              {editSaving ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />} SAVE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
