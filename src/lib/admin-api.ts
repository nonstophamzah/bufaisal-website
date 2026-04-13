// Client-side helper for admin API calls
// Replaces direct Supabase anon access with secure server-side routes

function getAdminName(): string {
  try {
    const session = sessionStorage.getItem('admin_session');
    if (session) {
      const parsed = JSON.parse(session);
      return parsed.name || 'Admin';
    }
  } catch { /* ignore */ }
  return 'Admin';
}

async function adminItemsApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/admin/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-name': getAdminName(),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function adminConfigApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/admin/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-name': getAdminName(),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Item operations ──

export async function getItems(opts?: {
  columns?: string;
  filter?: Record<string, string>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await adminItemsApi<{ items: any[] }>({ action: 'get_items', ...opts });
  return data.items || [];
}

export async function insertItem(item: Record<string, unknown>): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'insert_item', item });
}

export async function approveItem(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'approve', id });
}

export async function bulkApproveItems(ids: string[]): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'bulk_approve', ids });
}

export async function rejectItem(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'reject', id });
}

export async function bulkRejectItems(ids: string[]): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'bulk_reject', ids });
}

export async function markSold(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'mark_sold', id });
}

export async function unmarkSold(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'unmark_sold', id });
}

export async function hideItem(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'hide', id });
}

export async function unhideItem(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'unhide', id });
}

export async function deleteItem(id: string): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'delete', id });
}

export async function toggleFeatured(id: string, currentValue: boolean): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'toggle_featured', id, is_featured: currentValue });
}

export async function editItem(id: string, updates: Record<string, unknown>): Promise<{ error?: string }> {
  return adminItemsApi({ action: 'edit', id, updates });
}

// ── Config operations ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getConfig(): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await adminConfigApi<{ config: any[] }>({
    action: 'get_config',
  });
  return data.config || [];
}

export async function updateConfig(config_key: string, config_value: string): Promise<{ error?: string }> {
  return adminConfigApi({ action: 'update_config', config_key, config_value });
}
