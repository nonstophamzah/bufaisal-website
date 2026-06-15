'use client';

import { useState, useCallback } from 'react';
import { ShopItem } from '@/lib/supabase';
import * as adminApi from '@/lib/admin-api';
import type { BulkAction, PreviousStatus } from '@/lib/admin-api';

type Tab = 'pending' | 'published' | 'sold' | 'hidden';

// PR #15: showToast can carry an optional onUndo callback. Settings
// and Team hooks still call it with two arguments and stay
// backwards-compatible.
type ToastFn = (
  type: 'ok' | 'err',
  msg: string,
  opts?: { onUndo?: () => void; durationMs?: number }
) => void;

function pastTenseLabel(action: BulkAction, count: number): string {
  const verb =
    action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : action === 'hide'
          ? 'hidden'
          : action === 'mark_sold_online'
            ? 'marked as sold online'
            : action === 'mark_sold_shop'
              ? 'marked as sold in shop'
              : action === 'mark_live'
              ? 'moved to Live'
              : 'deleted';
  return `${count} item${count === 1 ? '' : 's'} ${verb}`;
}

export function useAdminItems(tab: Tab, onToast: ToastFn) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ShopItem>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    setEditingId(null);

    const filter: Record<string, string> = {};
    if (tab === 'pending') {
      filter['is_published'] = 'false';
      filter['is_sold'] = 'false';
      filter['is_hidden'] = 'false';
    } else if (tab === 'published') {
      filter['is_published'] = 'true';
      filter['is_sold'] = 'false';
      filter['is_hidden'] = 'false';
    } else if (tab === 'sold') {
      filter['is_sold'] = 'true';
    } else if (tab === 'hidden') {
      filter['is_hidden'] = 'true';
    }

    const order = tab === 'published'
      ? { column: 'is_featured', ascending: false }
      : { column: 'created_at', ascending: false };

    const data = await adminApi.getItems({ filter, order });
    setItems(data || []);
    setLoading(false);
  }, [tab]);

  const approve = useCallback(async (id: string) => {
    const result = await adminApi.approveItem(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item approved');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const reject = useCallback(async (id: string) => {
    if (!confirm('Delete this item permanently?')) return;
    const result = await adminApi.rejectItem(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item deleted');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const markSold = useCallback(async (id: string, channel: 'online' | 'shop') => {
    const result = await adminApi.markSold(id, channel);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', channel === 'online' ? 'Marked as sold online' : 'Marked as sold in shop');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const unsell = useCallback(async (id: string) => {
    const result = await adminApi.unmarkSold(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item restored to live');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const hide = useCallback(async (id: string) => {
    const result = await adminApi.hideItem(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item hidden');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const unhide = useCallback(async (id: string) => {
    const result = await adminApi.unhideItem(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item unhidden');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const deletePermanently = useCallback(async (id: string) => {
    if (!confirm('Delete permanently? This cannot be undone.')) return;
    const result = await adminApi.deleteItem(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item deleted permanently');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const toggleFeatured = useCallback(async (id: string, current: boolean) => {
    const result = await adminApi.toggleFeatured(id, current);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', current ? 'Unfeatured' : 'Featured');
      fetchItems();
    }
  }, [fetchItems, onToast]);

  const startEdit = useCallback((item: ShopItem) => {
    setEditingId(item.id);
    setEditForm({
      item_name: item.item_name,
      brand: item.brand || '',
      category: item.category,
      condition: item.condition || 'Good',
      description: item.description || '',
      sale_price: item.sale_price,
      barcode: item.barcode || '',
      product_type: item.product_type || '',
      seo_title: item.seo_title || '',
      seo_description: item.seo_description || '',
      is_featured: item.is_featured,
      // Pre-PR-#12 rows may come back without the column; treat undefined
      // as negotiable so the toggle starts in the safe default state.
      negotiable: item.negotiable !== false,
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    if (!editForm.item_name || !(editForm.item_name as string).trim()) {
      onToast('err', 'Item name is required');
      return;
    }
    const result = await adminApi.editItem(editingId, {
      item_name: (editForm.item_name as string).trim(),
      brand: editForm.brand || null,
      category: editForm.category,
      condition: editForm.condition,
      description: editForm.description || null,
      sale_price: Number(editForm.sale_price) || 0,
      barcode: editForm.barcode || null,
      product_type: editForm.product_type || null,
      seo_title: editForm.seo_title || null,
      seo_description: editForm.seo_description || null,
      is_featured: editForm.is_featured ?? false,
      negotiable: editForm.negotiable ?? true,
    });
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Item updated');
      setEditingId(null);
      fetchItems();
    }
  }, [editingId, editForm, fetchItems, onToast]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }, [items, selected.size]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // PR #15: single bulk runner for all six actions. Optimistically
  // removes the affected items from the current tab (they're moving
  // to a different tab's filter or going away entirely), then puts
  // back any items the server failed to update. The toast carries an
  // Undo callback for non-delete actions.
  const runBulkAction = useCallback(
    async (action: BulkAction) => {
      if (selected.size === 0) return;
      const ids = Array.from(selected);
      const idSet = new Set(ids);
      const itemsBefore = items;
      const selectedItems = items.filter((i) => idSet.has(i.id));

      setItems((cur) => cur.filter((i) => !idSet.has(i.id)));
      setSelected(new Set());
      setBulkBusy(action);

      try {
        const result = await adminApi.batchAction(action, ids);
        if (result.error) {
          setItems(itemsBefore);
          onToast('err', result.error);
          return;
        }

        const successIds = new Set(
          (result.previousStatuses ?? []).map((p) => p.itemId)
        );
        const failedItems = selectedItems.filter((it) => !successIds.has(it.id));

        if (failedItems.length > 0) {
          // Put items the server didn't touch back into the visible tab.
          setItems((cur) => [...failedItems, ...cur]);
        }

        if (result.success === 0) {
          onToast(
            'err',
            result.errors?.[0]?.error || 'Bulk action failed for every item'
          );
          return;
        }

        const undoable = action !== 'delete' && (result.previousStatuses ?? []).length > 0;
        const baseMsg = pastTenseLabel(action, result.success);
        const msg = result.failed
          ? `${baseMsg} (${result.failed} failed)`
          : baseMsg;

        if (undoable) {
          const previousStatuses = result.previousStatuses ?? [];
          onToast('ok', msg, {
            onUndo: async () => {
              const undoResult = await adminApi.undoBatch(previousStatuses);
              if (undoResult.error) {
                onToast('err', undoResult.error);
              } else {
                onToast(
                  'ok',
                  `${undoResult.success} item${undoResult.success === 1 ? '' : 's'} restored`
                );
                fetchItems();
              }
            },
            durationMs: 5000,
          });
        } else {
          onToast('ok', msg);
        }
      } catch (err) {
        setItems(itemsBefore);
        onToast('err', err instanceof Error ? err.message : 'Network error');
      } finally {
        setBulkBusy(null);
      }
    },
    [selected, items, fetchItems, onToast]
  );

  return {
    items,
    loading,
    editingId,
    editForm,
    setEditForm,
    selected,
    bulkBusy,
    fetchItems,
    approve,
    reject,
    markSold,
    unsell,
    hide,
    unhide,
    deletePermanently,
    toggleFeatured,
    startEdit,
    saveEdit,
    cancelEdit,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    runBulkAction,
  };
}

// Re-export for component consumers
export type { BulkAction, PreviousStatus };
