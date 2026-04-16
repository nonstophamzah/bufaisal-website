// Client-side helper for admin API calls
// Uses signed session tokens for authentication

function getAdminSession(): { name: string; token: string } | null {
  try {
    const session = sessionStorage.getItem('admin_session');
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed.token) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function getAuthHeaders(): Record<string, string> {
  const session = getAdminSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  // Legacy fallback — remove after full migration
  if (session?.name) {
    headers['x-admin-name'] = session.name;
  }
  return headers;
}

async function adminItemsApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/admin/items', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    sessionStorage.removeItem('admin_session');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  return res.json();
}

async function adminConfigApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/admin/config', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    sessionStorage.removeItem('admin_session');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
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
