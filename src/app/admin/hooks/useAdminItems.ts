'use client';

import { useState, useCallback } from 'react';
import { ShopItem } from '@/lib/supabase';
import * as adminApi from '@/lib/admin-api';

type Tab = 'pending' | 'published' | 'sold' | 'hidden';

export function useAdminItems(
  tab: Tab,
  onToast: (type: 'ok' | 'err', msg: string) => void
) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ShopItem>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const markSold = useCallback(async (id: string) => {
    const result = await adminApi.markSold(id);
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', 'Marked as sold');
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

  const bulkApprove = useCallback(async () => {
    if (selected.size === 0) return;
    const result = await adminApi.bulkApproveItems(Array.from(selected));
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', `${selected.size} items approved`);
      fetchItems();
    }
  }, [selected, fetchItems, onToast]);

  const bulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} items permanently?`)) return;
    const result = await adminApi.bulkRejectItems(Array.from(selected));
    if (result.error) {
      onToast('err', result.error);
    } else {
      onToast('ok', `${selected.size} items deleted`);
      fetchItems();
    }
  }, [selected, fetchItems, onToast]);

  return {
    items,
    loading,
    editingId,
    editForm,
    setEditForm,
    selected,
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
    bulkApprove,
    bulkDelete,
  };
}
