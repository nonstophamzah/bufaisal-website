// Client-side helper for appliance API calls (replaces direct Supabase access)

async function applianceApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/appliances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function checkEntryCode(code: string): Promise<boolean> {
  const data = await applianceApi<{ match: boolean }>({ action: 'check_entry_code', code });
  return data.match;
}

export async function checkManagerCode(code: string): Promise<boolean> {
  const data = await applianceApi<{ match: boolean }>({ action: 'check_manager_code', code });
  return data.match;
}

export async function getWorkers(): Promise<{ id: string; name: string; role: string }[]> {
  const data = await applianceApi<{ workers: { id: string; name: string; role: string }[] }>({
    action: 'get_workers',
  });
  return data.workers || [];
}

export async function getItems(opts: {
  columns?: string;
  filter?: Record<string, string>;
  is_null?: string[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await applianceApi<{ items: any[] }>({ action: 'get_items', ...opts });
  return data.items || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertItem(item: Record<string, any>): Promise<{ error?: string }> {
  return applianceApi({ action: 'insert_item', item });
}

export async function updateItem(id: string, updates: Record<string, unknown>): Promise<{ error?: string }> {
  return applianceApi({ action: 'update_item', id, updates });
}

export async function bulkUpdateItems(ids: string[], updates: Record<string, unknown>): Promise<{ error?: string }> {
  return applianceApi({ action: 'bulk_update_items', ids, updates });
}
