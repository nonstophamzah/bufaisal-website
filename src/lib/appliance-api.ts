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

// ═══════════════════════════════════════════════════════════════════
// Spare parts usage — client wrappers
// ═══════════════════════════════════════════════════════════════════

export interface SparePartUsage {
  id: string;
  part_barcode: string;
  part_label_text: string | null;
  part_type: string | null;
  installed_in_item_id: string;
  installed_by: string;
  date_installed: string;
  photo_url: string;
  notes: string | null;
  created_at: string;
}

export async function logSparePartUsage(input: {
  part_barcode: string;
  part_label_text?: string | null;
  part_type?: string | null;
  installed_in_item_id: string;
  installed_by: string;
  photo_url: string;
  notes?: string | null;
}): Promise<{ success?: boolean; part?: SparePartUsage; error?: string }> {
  return applianceApi({ action: 'log_spare_part_usage', ...input });
}

export async function getPartsForItem(item_id: string): Promise<SparePartUsage[]> {
  const data = await applianceApi<{ parts: SparePartUsage[]; error?: string }>({
    action: 'get_parts_for_item',
    item_id,
  });
  return data.parts || [];
}

export async function getAllPartsUsage(opts?: {
  limit?: number;
  worker?: string;
  since_days?: number;
}): Promise<SparePartUsage[]> {
  const data = await applianceApi<{ parts: SparePartUsage[]; error?: string }>({
    action: 'get_all_parts_usage',
    ...(opts || {}),
  });
  return data.parts || [];
}

export async function deletePartsUsage(id: string): Promise<{ error?: string }> {
  return applianceApi({ action: 'delete_parts_usage', id });
}
