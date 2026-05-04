'use client';

import { useState } from 'react';
import {
  Check,
  X,
  Eye,
  EyeOff,
  Pencil,
  Star,
  Trash2,
  Undo2,
  MousePointerClick,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import type { BulkAction } from '@/lib/admin-api';
import {
  Thumb,
  ConditionBadge,
  EmptyState,
  Spinner,
  EditPanel,
  fmtDate,
} from './shared';

type ItemsTab = 'pending' | 'published' | 'sold' | 'hidden';

// PR #15: per-tab definition of which bulk actions are offered.
// Order matters — the primary (yellow) action goes first so it gets
// rendered as the leftmost button in the toolbar.
const BULK_ACTIONS_BY_TAB: Record<ItemsTab, ReadonlyArray<BulkActionSpec>> = {
  pending: [
    { action: 'approve', label: 'Approve', tone: 'primary' },
    { action: 'reject', label: 'Reject', tone: 'danger' },
    { action: 'hide', label: 'Hide', tone: 'neutral' },
  ],
  published: [
    { action: 'mark_sold', label: 'Mark as Sold', tone: 'primary' },
    { action: 'hide', label: 'Hide', tone: 'neutral' },
    { action: 'delete', label: 'Delete', tone: 'destructive' },
  ],
  sold: [
    { action: 'hide', label: 'Move to Hidden', tone: 'neutral' },
    { action: 'delete', label: 'Delete', tone: 'destructive' },
  ],
  hidden: [
    { action: 'mark_live', label: 'Move to Live', tone: 'primary' },
    { action: 'delete', label: 'Delete', tone: 'destructive' },
  ],
};

type BulkActionSpec = {
  action: BulkAction;
  label: string;
  tone: 'primary' | 'neutral' | 'danger' | 'destructive';
};

export function AdminItems({
  tab,
  items,
  loading,
  editingId,
  editForm,
  setEditForm,
  selected,
  bulkBusy,
  onApprove,
  onReject,
  onMarkSold,
  onUnsell,
  onHide,
  onUnhide,
  onDeletePermanently,
  onToggleFeatured,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onRunBulkAction,
}: {
  tab: ItemsTab;
  items: ShopItem[];
  loading: boolean;
  editingId: string | null;
  editForm: Partial<ShopItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<ShopItem>>>;
  selected: Set<string>;
  bulkBusy: BulkAction | null;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onMarkSold: (id: string) => Promise<void>;
  onUnsell: (id: string) => Promise<void>;
  onHide: (id: string) => Promise<void>;
  onUnhide: (id: string) => Promise<void>;
  onDeletePermanently: (id: string) => Promise<void>;
  onToggleFeatured: (id: string, current: boolean) => Promise<void>;
  onStartEdit: (item: ShopItem) => void;
  onSaveEdit: () => Promise<void>;
  onCancelEdit: () => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onRunBulkAction: (action: BulkAction) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<BulkActionSpec | null>(null);

  if (loading) return <Spinner />;
  if (items.length === 0) {
    return <EmptyState text={emptyText(tab)} />;
  }

  const selectedItems = items.filter((i) => selected.has(i.id));
  const totalValue = selectedItems.reduce(
    (sum, item) => sum + (item.sale_price || 0),
    0
  );
  const actions = BULK_ACTIONS_BY_TAB[tab];

  const requestBulk = (spec: BulkActionSpec) => {
    if (selected.size === 0) return;
    setPendingAction(spec);
  };

  const confirmBulk = async () => {
    if (!pendingAction) return;
    const action = pendingAction.action;
    setPendingAction(null);
    await onRunBulkAction(action);
  };

  return (
    <>
      <BulkToolbar
        items={items}
        selectedCount={selected.size}
        totalValue={totalValue}
        allSelected={selected.size === items.length && items.length > 0}
        actions={actions}
        bulkBusy={bulkBusy}
        onToggleSelectAll={onToggleSelectAll}
        onClearSelection={onClearSelection}
        onRequestAction={requestBulk}
      />

      <div className="space-y-3">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            tab={tab}
            item={item}
            checked={selected.has(item.id)}
            editing={editingId === item.id}
            editForm={editForm}
            setEditForm={setEditForm}
            onToggleSelect={onToggleSelect}
            onApprove={onApprove}
            onReject={onReject}
            onMarkSold={onMarkSold}
            onUnsell={onUnsell}
            onHide={onHide}
            onUnhide={onUnhide}
            onDeletePermanently={onDeletePermanently}
            onToggleFeatured={onToggleFeatured}
            onStartEdit={onStartEdit}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
          />
        ))}
      </div>

      {pendingAction && (
        <BulkConfirmModal
          spec={pendingAction}
          selectedItems={selectedItems}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmBulk}
        />
      )}
    </>
  );
}

function emptyText(tab: ItemsTab): string {
  switch (tab) {
    case 'pending':
      return 'No pending items to review';
    case 'published':
      return 'No published items';
    case 'sold':
      return 'No sold items yet';
    case 'hidden':
      return 'No hidden items';
  }
}

// ────────────────────────────────────────────────────────────────
// Bulk toolbar — sticks to the top of the list when 1+ selected.
// ────────────────────────────────────────────────────────────────

function BulkToolbar({
  items,
  selectedCount,
  totalValue,
  allSelected,
  actions,
  bulkBusy,
  onToggleSelectAll,
  onClearSelection,
  onRequestAction,
}: {
  items: ShopItem[];
  selectedCount: number;
  totalValue: number;
  allSelected: boolean;
  actions: ReadonlyArray<BulkActionSpec>;
  bulkBusy: BulkAction | null;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onRequestAction: (spec: BulkActionSpec) => void;
}) {
  const hasSelection = selectedCount > 0;
  return (
    <div
      className={`sticky top-20 z-20 mb-4 rounded-xl border transition-colors ${
        hasSelection
          ? 'bg-yellow/10 border-yellow shadow-sm'
          : 'bg-gray-50 border-transparent'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 p-3">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleSelectAll}
            aria-label="Select all visible items"
            className="w-4 h-4 accent-yellow"
          />
          Select All ({selectedCount}/{items.length})
        </label>

        {hasSelection && (
          <>
            <span className="text-sm text-muted">
              <span className="font-bold text-black">{selectedCount}</span>{' '}
              item{selectedCount === 1 ? '' : 's'} selected
              {totalValue > 0 && (
                <>
                  {' · '}Total{' '}
                  <span className="font-bold text-black">
                    {totalValue.toLocaleString('en-US')} AED
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-muted hover:text-black underline"
            >
              Clear
            </button>
            <div className="flex flex-wrap gap-2 ml-auto">
              {actions.map((spec) => (
                <BulkActionButton
                  key={spec.action}
                  spec={spec}
                  busy={bulkBusy === spec.action}
                  disabled={bulkBusy !== null}
                  onClick={() => onRequestAction(spec)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BulkActionButton({
  spec,
  busy,
  disabled,
  onClick,
}: {
  spec: BulkActionSpec;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = spec.tone;
  const cls =
    tone === 'primary'
      ? 'bg-yellow text-black hover:bg-yellow/90'
      : tone === 'destructive'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : tone === 'danger'
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : null}
      {spec.label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// Confirmation modal — type-DELETE gate for destructive actions.
// ────────────────────────────────────────────────────────────────

function BulkConfirmModal({
  spec,
  selectedItems,
  onCancel,
  onConfirm,
}: {
  spec: BulkActionSpec;
  selectedItems: ShopItem[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const isDestructive = spec.tone === 'destructive';
  const requiresTyping = isDestructive;
  const canConfirm = !requiresTyping || typed.trim().toUpperCase() === 'DELETE';

  const previewItems = selectedItems.slice(0, 3);
  const moreCount = Math.max(0, selectedItems.length - previewItems.length);

  const buttonClass = isDestructive
    ? 'bg-red-600 text-white hover:bg-red-700'
    : spec.tone === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : 'bg-yellow text-black hover:bg-yellow/90';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-confirm-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
        <h2 id="bulk-confirm-title" className="font-heading text-2xl mb-1">
          {spec.label.toUpperCase()}{' '}
          <span className="text-yellow">
            {selectedItems.length} ITEM{selectedItems.length === 1 ? '' : 'S'}
          </span>
        </h2>
        <p className="text-sm text-muted mb-3">
          Are you sure you want to {spec.label.toLowerCase()}{' '}
          {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}?
          {isDestructive && ' This cannot be undone.'}
        </p>

        <ul className="text-sm space-y-1 mb-4 bg-gray-50 rounded-lg p-3">
          {previewItems.map((item) => (
            <li key={item.id} className="truncate">
              · {item.item_name}
            </li>
          ))}
          {moreCount > 0 && (
            <li className="text-muted">…and {moreCount} more</li>
          )}
        </ul>

        {requiresTyping && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Type <span className="font-mono">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-600"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonClass}`}
          >
            Confirm {spec.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Per-item row. Same per-tab content as before, plus a checkbox
// column on every tab and a yellow tint when selected.
// ────────────────────────────────────────────────────────────────

function ItemRow({
  tab,
  item,
  checked,
  editing,
  editForm,
  setEditForm,
  onToggleSelect,
  onApprove,
  onReject,
  onMarkSold,
  onUnsell,
  onHide,
  onUnhide,
  onDeletePermanently,
  onToggleFeatured,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  tab: ItemsTab;
  item: ShopItem;
  checked: boolean;
  editing: boolean;
  editForm: Partial<ShopItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<ShopItem>>>;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onMarkSold: (id: string) => Promise<void>;
  onUnsell: (id: string) => Promise<void>;
  onHide: (id: string) => Promise<void>;
  onUnhide: (id: string) => Promise<void>;
  onDeletePermanently: (id: string) => Promise<void>;
  onToggleFeatured: (id: string, current: boolean) => Promise<void>;
  onStartEdit: (item: ShopItem) => void;
  onSaveEdit: () => Promise<void>;
  onCancelEdit: () => void;
}) {
  const showEdit = tab === 'pending' || tab === 'published';
  return (
    <div>
      <div
        className={`flex items-center gap-3 bg-white border rounded-xl p-3 transition-colors ${
          checked ? 'border-yellow ring-2 ring-yellow/30 bg-yellow/5' : 'border-gray-200'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleSelect(item.id)}
          aria-label={`Select ${item.item_name}`}
          className="w-4 h-4 accent-yellow flex-shrink-0"
        />
        <Thumb item={item} />

        {/* Body — varies by tab */}
        {tab === 'pending' && <PendingBody item={item} />}
        {tab === 'published' && <PublishedBody item={item} />}
        {tab === 'sold' && <SoldBody item={item} />}
        {tab === 'hidden' && <HiddenBody item={item} />}

        {/* Actions — varies by tab */}
        <div className="flex gap-1.5 flex-shrink-0">
          {tab === 'pending' && (
            <>
              <button
                onClick={() => onApprove(item.id)}
                className="w-9 h-9 bg-green-100 text-green-600 rounded-lg flex items-center justify-center hover:bg-green-200"
                title="Approve"
                aria-label="Approve"
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => onReject(item.id)}
                className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200"
                title="Reject / Delete"
                aria-label="Reject"
              >
                <X size={18} />
              </button>
            </>
          )}
          {tab === 'published' && (
            <>
              <button
                onClick={() => onToggleFeatured(item.id, item.is_featured)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  item.is_featured
                    ? 'bg-yellow text-black'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
                title={item.is_featured ? 'Unfeature' : 'Feature'}
              >
                <Star size={16} />
              </button>
              <button
                onClick={() => onMarkSold(item.id)}
                className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
                title="Mark Sold"
              >
                Sold
              </button>
              <button
                onClick={() => onHide(item.id)}
                className="w-9 h-9 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200"
                title="Hide"
                aria-label="Hide"
              >
                <EyeOff size={16} />
              </button>
            </>
          )}
          {tab === 'sold' && (
            <button
              onClick={() => onUnsell(item.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-yellow text-black text-xs font-semibold rounded-lg hover:bg-yellow/90"
              title="Put back live"
            >
              <Undo2 size={14} /> Unsell
            </button>
          )}
          {tab === 'hidden' && (
            <>
              <button
                onClick={() => onUnhide(item.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-yellow text-black text-xs font-semibold rounded-lg hover:bg-yellow/90"
              >
                <Eye size={14} /> Unhide
              </button>
              <button
                onClick={() => onDeletePermanently(item.id)}
                className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200"
                title="Delete permanently"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          {showEdit && (
            <button
              onClick={() => (editing ? onCancelEdit() : onStartEdit(item))}
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                editing
                  ? 'bg-yellow text-black'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="Edit"
              aria-label="Edit"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>
      </div>

      {editing && showEdit && (
        <EditPanel
          itemId={item.id}
          editForm={editForm}
          setEditForm={setEditForm}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
          showPrice
        />
      )}
    </div>
  );
}

function PendingBody({ item }: { item: ShopItem }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <h3 className="font-semibold text-sm truncate">{item.item_name}</h3>
        {item.status === 'agent_drafting' && (
          <span
            title="Background AI job is generating the title and description. Refresh in ~30s."
            className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow/20 text-yellow-700 border border-yellow/40 flex-shrink-0"
          >
            <Sparkles size={10} className="animate-pulse" />
            AI generating…
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
        <span className="text-xs text-muted">{item.category}</span>
        <ConditionBadge condition={item.condition} />
        {item.negotiable === false && (
          <span
            title="Price is at the floor — customer sees a Starting Price pill, not Negotiable."
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700"
          >
            Starting Price
          </span>
        )}
      </div>
      <p className="text-xs text-muted mt-0.5">
        {item.shop_source || item.shop_label || '—'} ·{' '}
        {item.duty_manager || item.uploaded_by || '—'} · {fmtDate(item.created_at)}
      </p>
    </div>
  );
}

function PublishedBody({ item }: { item: ShopItem }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm truncate">{item.item_name}</h3>
        {item.is_featured && (
          <Star size={14} className="text-yellow fill-yellow flex-shrink-0" />
        )}
      </div>
      <p className="font-heading text-lg leading-tight">AED {item.sale_price}</p>
      <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
        {(item.duty_manager || item.uploaded_by) && (
          <span>by {item.duty_manager || item.uploaded_by}</span>
        )}
        <span className="flex items-center gap-0.5">
          <Eye size={12} /> {item.view_count}
        </span>
        <span className="flex items-center gap-0.5">
          <MousePointerClick size={12} /> {item.whatsapp_clicks}
        </span>
        <ConditionBadge condition={item.condition} />
        {item.negotiable === false && (
          <span
            title="Price is at the floor — customer sees a Starting Price pill, not Negotiable."
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700"
          >
            Starting Price
          </span>
        )}
      </div>
    </div>
  );
}

function SoldBody({ item }: { item: ShopItem }) {
  return (
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm truncate">{item.item_name}</h3>
      <p className="font-heading text-lg leading-tight">AED {item.sale_price}</p>
      <p className="text-xs text-muted mt-0.5">
        {item.duty_manager || item.uploaded_by
          ? `by ${item.duty_manager || item.uploaded_by} · `
          : ''}
        Sold · {fmtDate(item.updated_at)}
      </p>
    </div>
  );
}

function HiddenBody({ item }: { item: ShopItem }) {
  return (
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm truncate">{item.item_name}</h3>
      <p className="text-xs text-muted">
        {item.category} · {item.shop_source || '—'}
      </p>
    </div>
  );
}
