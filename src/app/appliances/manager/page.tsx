'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, Undo2 } from 'lucide-react';
import { getItems, updateItem, bulkUpdateItems } from '@/lib/appliance-api';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';
import { useManagerData } from './hooks/useManagerData';
import { ManagerHeader } from './components/ManagerHeader';
import { AlertBanner } from './components/AlertBanner';
import { MetricsGrid } from './components/MetricsGrid';
import { IntakeChart } from './components/IntakeChart';
import { ItemsList } from './components/ItemsList';
import { PendingApprovals } from './components/PendingApprovals';
import { EditModal } from './components/EditModal';
import { RejectConfirmModal } from './components/RejectConfirmModal';
import { CleaningActivity } from './components/CleaningActivity';

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
  // cleaning fields
  cleaning_status?: string | null;
  cleaned_by?: string | null;
  date_cleaning_claimed?: string | null;
  date_cleaned?: string | null;
  cleaning_flagged?: boolean | null;
  cleaning_flag_note?: string | null;
  cleaning_flagged_at?: string | null;
  before_cleaning_photos?: string[] | null;
  after_cleaning_photos?: string[] | null;
}

interface EditFormData {
  product_type: string;
  brand: string;
  status: string;
  problems: string[];
  shop: string;
  barcode: string;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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

  // Clearing a cleaning flag (which item is in flight)
  const [clearingFlag, setClearingFlag] = useState<string | null>(null);

  // Edit modal
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    product_type: '',
    brand: '',
    status: '',
    problems: [],
    shop: '',
    barcode: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  // Get computed data from hook
  const {
    pending,
    approved,
    rejected,
    overdueItems,
    flaggedItems,
    inCleaningItems,
    cleaningPendingItems,
    recentlyCleaned,
    metrics,
    trends,
    costMetrics,
    intakeVelocity,
    maxIntake,
    shopCounts,
    maxShopCount,
    filtered,
  } = useManagerData(allItems, shopFilter, statusFilter, dateFilter, listTab);

  // Search results
  const searchResults =
    searchQ.trim().length >= 2
      ? allItems.filter((i) => i.barcode.toLowerCase().includes(searchQ.trim().toLowerCase()))
      : [];

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const w = sessionStorage.getItem('app_worker');
    if (!w) {
      router.replace('/appliances');
      return;
    }
    const parsed = JSON.parse(w);
    if (parsed.role !== 'manager') {
      router.replace('/appliances/select');
      return;
    }
    setWorker(parsed);
  }, [router]);

  const fetchItems = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getItems({ order: { column: 'created_at', ascending: false }, limit: 500 });
      setAllItems(data as Item[]);
      setLastRefreshed(new Date());
    } catch {
      showToast('err', 'Failed to load items');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (worker) fetchItems();
  }, [worker, fetchItems]);

  // ══════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════

  const approveItem = async (id: string) => {
    try {
      const result = await updateItem(id, { approval_status: 'approved' });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item approved');
      fetchItems(true);
    } catch {
      showToast('err', 'Failed to approve. Try again.');
    }
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    try {
      const result = await bulkUpdateItems(Array.from(selected), { approval_status: 'approved' });
      if (result.error) throw new Error(result.error);
      showToast('ok', `${selected.size} items approved`);
      setSelected(new Set());
      fetchItems(true);
    } catch {
      showToast('err', 'Failed to approve. Try again.');
    }
  };

  const confirmReject = async () => {
    if (!rejectConfirm) return;
    try {
      const result = await updateItem(rejectConfirm, { approval_status: 'rejected' });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item rejected');
      setRejectConfirm(null);
      fetchItems(true);
    } catch {
      showToast('err', 'Failed to reject. Try again.');
    }
  };

  const clearFlag = async (id: string) => {
    setClearingFlag(id);
    try {
      const result = await updateItem(id, {
        cleaning_flagged: false,
        cleaning_flag_note: null,
      });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Flag cleared');
      fetchItems(true);
    } catch {
      showToast('err', 'Failed to clear flag. Try again.');
    }
    setClearingFlag(null);
  };

  const jumpToCleaning = () => {
    document.getElementById('cleaning-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const undoReject = async (id: string) => {
    try {
      const result = await updateItem(id, { approval_status: 'pending' });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item moved back to pending');
      fetchItems(true);
    } catch {
      showToast('err', 'Failed to undo. Try again.');
    }
  };

  const openEdit = (item: Item) => {
    const condToLabel: Record<string, string> = {
      working: 'Working',
      not_working: 'Not Working',
      scrap: 'Scrap',
      pending_scrap: 'Not Working',
      repaired: 'Working',
    };
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
      const conditionMap: Record<string, string> = {
        Working: 'working',
        'Not Working': 'not_working',
        Scrap: 'scrap',
      };
      const result = await updateItem(editItem.id, {
        product_type: editForm.product_type,
        brand: editForm.brand,
        status: editForm.status,
        condition: conditionMap[editForm.status] || editForm.status.toLowerCase().replace(/ /g, '_'),
        problems: editForm.status === 'Not Working' ? editForm.problems : [],
        shop: editForm.shop,
        barcode: editForm.barcode,
        needs_jurf: editForm.status === 'Not Working',
      });
      if (result.error) throw new Error(result.error);
      showToast('ok', 'Item updated');
      setEditItem(null);
      fetchItems(true);
    } catch {
      showToast('err', 'Failed to save. Try again.');
    }
    setEditSaving(false);
  };

  const toggleEditProblem = (p: string) => {
    setEditForm((f) => ({
      ...f,
      problems: f.problems.includes(p) ? f.problems.filter((x) => x !== p) : [...f.problems, p],
    }));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((i) => i.id)));
  };

  const exportCSV = () => {
    const headers = [
      'barcode',
      'product_type',
      'brand',
      'condition',
      'location_status',
      'status',
      'shop',
      'date_received',
      'date_sent_to_jurf',
      'approval_status',
      'problems',
    ];
    const rows = filtered.map((i) => [
      i.barcode,
      i.product_type || '',
      i.brand || '',
      i.condition || '',
      i.location_status || '',
      i.status || '',
      i.shop || '',
      i.date_received || '',
      i.date_sent_to_jurf || '',
      i.approval_status || '',
      (i.problems || []).join('; '),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appliances-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToSheets = async () => {
    setSheetsExporting(true);
    try {
      const res = await fetch('/api/export-to-sheets', {
        method: 'POST',
        headers: { 'x-manager-name': worker?.name || 'unknown' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      showToast('ok', `Exported ${data.itemCount} items to Google Sheets`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Export failed');
    }
    setSheetsExporting(false);
  };

  const renderRejectedActions = (item: Item) => (
    <button
      onClick={() => undoReject(item.id)}
      className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95 min-h-[48px]"
    >
      <Undo2 size={16} /> UNDO — MOVE TO PENDING
    </button>
  );

  if (!worker)
    return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-full overflow-x-hidden bg-[#111]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-sm font-bold shadow-lg top-[calc(env(safe-area-inset-top)+70px)] ${
            toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <ManagerHeader
        workerName={worker.name}
        lastRefreshedTime={lastRefreshed ? fmtTime(lastRefreshed) : ''}
        totalItems={allItems.length}
        onRefresh={() => fetchItems(true)}
        refreshing={refreshing}
        onExportToSheets={exportToSheets}
        sheetsExporting={sheetsExporting}
      />

      {/* Spacer for fixed header */}
      <div className="h-[calc(env(safe-area-inset-top)+60px)]" />

      {/* Alert Banner */}
      <AlertBanner
        overdueCount={overdueItems.length}
        pendingCount={pending.length}
        flaggedCount={flaggedItems.length}
        onJumpToFlagged={jumpToCleaning}
      />

      {/* Cleaning Activity (flagged items, in-progress, recently cleaned) */}
      <CleaningActivity
        sectionId="cleaning-activity"
        flaggedItems={flaggedItems}
        inCleaningItems={inCleaningItems}
        cleaningPendingItems={cleaningPendingItems}
        recentlyCleaned={recentlyCleaned}
        onClearFlag={clearFlag}
        clearingFlag={clearingFlag}
      />

      {/* Metrics Grid */}
      <MetricsGrid
        metrics={metrics}
        trends={trends}
        shopCounts={shopCounts}
        maxShopCount={maxShopCount}
        costMetrics={costMetrics}
        onShopFilterChange={setShopFilter}
        activeShopFilter={shopFilter}
      />

      {/* Intake Chart */}
      <IntakeChart
        intakeVelocity={intakeVelocity}
        maxIntake={maxIntake}
        todayCount={trends.todayCount}
        yesterdayCount={trends.yesterdayCount}
        intakeDelta={trends.intakeDelta}
      />

      {/* Items List */}
      <ItemsList
        filteredItems={filtered}
        searchResults={searchResults}
        searchQuery={searchQ}
        onSearchChange={setSearchQ}
        listTab={listTab}
        onTabChange={(tab) => {
          setListTab(tab);
          setVisibleCount(20);
        }}
        approvedCount={approved.length}
        rejectedCount={rejected.length}
        shopFilter={shopFilter}
        onShopFilterChange={setShopFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        onExportCSV={exportCSV}
        visibleCount={visibleCount}
        onLoadMore={() => setVisibleCount((v) => v + 20)}
        expandedId={expanded}
        onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
        renderItemActions={listTab === 'rejected' ? renderRejectedActions : undefined}
      />

      {/* Pending Approvals */}
      <PendingApprovals
        pendingItems={pending}
        selectedIds={selected}
        onToggleSelect={toggleSelect}
        onSelectAll={toggleSelectAll}
        onApprove={approveItem}
        onEdit={openEdit}
        onReject={(id) => setRejectConfirm(id)}
      />

      {/* Bulk approve bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-black border-t-2 border-green-500 p-4">
          <button
            onClick={bulkApprove}
            className="w-full py-4 rounded-2xl bg-green-500 text-white font-heading text-xl flex items-center justify-center gap-2 active:scale-95"
          >
            <Check size={22} strokeWidth={3} /> APPROVE SELECTED ({selected.size})
          </button>
        </div>
      )}

      {/* Modals */}
      <RejectConfirmModal
        itemId={rejectConfirm}
        onConfirm={confirmReject}
        onCancel={() => setRejectConfirm(null)}
      />

      <EditModal
        item={editItem}
        editForm={editForm}
        onFormChange={(updates) => setEditForm((f) => ({ ...f, ...updates }))}
        onToggleProblem={toggleEditProblem}
        onSave={saveEdit}
        isSaving={editSaving}
        onClose={() => setEditItem(null)}
      />
    </div>
  );
}
