// Client-side helper for /api/carpenter-tracker (matches appliance-api.ts pattern).

async function carpenterApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/carpenter-tracker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export interface CarpenterWorker {
  id: string;
  name: string;
  shop: string;
  active: boolean;
}

export type JobType = 'USED' | 'NEW';

export interface CarpenterRate {
  id: string;
  item_type: string;
  job_type: JobType;
  rate_aed: number;
  active: boolean;
  updated_at: string;
}

export interface CarpenterItem {
  id: string;
  worker_id: string;
  worker_name: string;
  shop: string;
  item_type: string;
  job_type: JobType;
  rate_at_log: number;
  before_photo_url: string;
  after_photo_url: string;
  created_at: string;
}

export async function checkEntryCode(code: string): Promise<boolean> {
  const data = await carpenterApi<{ match: boolean }>({ action: 'check_entry_code', code });
  return data.match;
}

export async function checkManagerCode(code: string): Promise<boolean> {
  const data = await carpenterApi<{ match: boolean }>({ action: 'check_manager_code', code });
  return data.match;
}

export async function getWorkers(): Promise<CarpenterWorker[]> {
  const data = await carpenterApi<{ workers: CarpenterWorker[] }>({ action: 'get_workers' });
  return data.workers || [];
}

export async function getRates(jobType?: JobType): Promise<CarpenterRate[]> {
  const data = await carpenterApi<{ rates: CarpenterRate[] }>({
    action: 'get_rates',
    ...(jobType ? { job_type: jobType } : {}),
  });
  return data.rates || [];
}

export async function getAllRates(): Promise<CarpenterRate[]> {
  const data = await carpenterApi<{ rates: CarpenterRate[] }>({ action: 'get_all_rates' });
  return data.rates || [];
}

export async function insertItem(item: {
  worker_id: string;
  item_type: string;
  job_type: JobType;
  before_photo_url: string;
  after_photo_url: string;
}): Promise<{ success?: boolean; error?: string; id?: string }> {
  return carpenterApi({ action: 'insert_item', item });
}

export async function getItems(opts?: { since?: string; limit?: number }): Promise<CarpenterItem[]> {
  const data = await carpenterApi<{ items: CarpenterItem[] }>({ action: 'get_items', ...(opts || {}) });
  return data.items || [];
}

export async function updateRate(
  item_type: string,
  job_type: JobType,
  rate_aed: number,
): Promise<{ success?: boolean; error?: string }> {
  return carpenterApi({ action: 'update_rate', item_type, job_type, rate_aed });
}
