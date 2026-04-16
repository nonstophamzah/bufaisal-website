'use client';

import { Check, X, Eye, EyeOff, Pencil, Star, Trash2, Undo2, MousePointerClick } from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import {
  Thumb,
  ConditionBadge,
  EmptyState,
  Spinner,
  EditPanel,
  fmtDate,
} from './shared';

type ItemsTab = 'pending' | 'published' | 'sold' | 'hidden';

export function AdminItems({
  tab,
  items,
  loading,
  editingId,
  editForm,
  setEditForm,
  selected,
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
  onBulkApprove,
  onBulkDelete,
  showToast,
}: {
  tab: ItemsTab;
  items: ShopItem[];
  loading: boolean;
  editingId: string | null;
  editForm: Partial<ShopItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<ShopItem>>>;
  selected: Set<string>;
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
  onBulkApprove: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  showToast: (type: 'ok' | 'err', msg: string) => void;
}) {
  if (tab === 'pending') {
    return (
      <>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="No pending items to review" />
        ) : (
          <>
            {/* Bulk bar */}
            <div className="flex items-center gap-3 mb-4 bg-gray-50 p-3 rounded-xl">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.size === items.length && items.length > 0}
                  onChange={onToggleSelectAll}
                  className="w-4 h-4 accent-yellow"
                />
                Select All ({selected.size}/{items.length})
              </label>
              {selected.size > 0 && (
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={onBulkApprove}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
                  >
                    <Check size={14} /> Approve ({selected.size})
                  </button>
                  <button
                    onClick={onBulkDelete}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
                  >
                    <Trash2 size={14} /> Delete ({selected.size})
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id}>
                  <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                      className="w-4 h-4 accent-yellow flex-shrink-0"
                    />
                    <Thumb item={item} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {item.item_name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted">{item.category}</span>
                        <ConditionBadge condition={item.condition} />
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {item.shop_source || item.shop_label || '—'} &bull;{' '}
                        {item.duty_manager || item.uploaded_by || '—'} &bull;{' '}
                        {fmtDate(item.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => onApprove(item.id)}
                        className="w-9 h-9 bg-green-100 text-green-600 rounded-lg flex items-center justify-center hover:bg-green-200"
                        title="Approve"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => onReject(item.id)}
                        className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200"
                        title="Reject / Delete"
                      >
                        <X size={18} />
                      </button>
                      <button
                        onClick={() =>
                          editingId === item.id
                            ? onCancelEdit()
                            : onStartEdit(item)
                        }
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          editingId === item.id
                            ? 'bg-yellow text-black'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </div>

                  {editingId === item.id && (
                    <EditPanel
                      editForm={editForm}
                      setEditForm={setEditForm}
                      onSave={onSaveEdit}
                      onCancel={onCancelEdit}
                      showPrice
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  if (tab === 'published') {
    return (
      <>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="No published items" />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id}>
                <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                  <Thumb item={item} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">
                        {item.item_name}
                      </h3>
                      {item.is_featured && (
                        <Star
                          size={14}
                          className="text-yellow fill-yellow flex-shrink-0"
                        />
                      )}
                    </div>
                    <p className="font-heading text-lg leading-tight">
                      AED {item.sale_price}
                    </p>
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
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
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
                    >
                      <EyeOff size={16} />
                    </button>
                    <button
                      onClick={() =>
                        editingId === item.id
                          ? onCancelEdit()
                          : onStartEdit(item)
                      }
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        editingId === item.id
                          ? 'bg-yellow text-black'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>

                {editingId === item.id && (
                  <EditPanel
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onSave={onSaveEdit}
                    onCancel={onCancelEdit}
                    showPrice
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (tab === 'sold') {
    return (
      <>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="No sold items yet" />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3"
              >
                <Thumb item={item} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {item.item_name}
                  </h3>
                  <p className="font-heading text-lg leading-tight">
                    AED {item.sale_price}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {item.duty_manager || item.uploaded_by ? `by ${item.duty_manager || item.uploaded_by} · ` : ''}
                    Sold &bull; {fmtDate(item.updated_at)}
                  </p>
                </div>
                <button
                  onClick={() => onUnsell(item.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-yellow text-black text-xs font-semibold rounded-lg hover:bg-yellow/90"
                  title="Put back live"
                >
                  <Undo2 size={14} /> Unsell
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (tab === 'hidden') {
    return (
      <>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="No hidden items" />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3"
              >
                <Thumb item={item} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {item.item_name}
                  </h3>
                  <p className="text-xs text-muted">
                    {item.category} &bull; {item.shop_source || '—'}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
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
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return null;
}
