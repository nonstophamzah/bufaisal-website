// Phase 5 admin pending dashboard — client-side API helper.
//
// Mirrors the auth pattern in `src/lib/admin-api.ts` (HMAC bearer token
// from sessionStorage, 401 → bounce to /admin) but talks to the new
// sidecar routes under /api/admin/pending. The legacy routes are not
// touched.

import type {
  AuditLogEntry,
  PendingItem,
  PendingItemEdits,
} from '@/app/admin/pending/types';

function getAdminSession(): { name: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem('admin_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function authHeaders(): Record<string, string> {
  const session = getAdminSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
  return headers;
}

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown }
): Promise<T> {
  const res = await fetch(path, {
    method: init.method,
    headers: authHeaders(),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) {
    sessionStorage.removeItem('admin_session');
    window.location.href = '/admin';
    throw new Error('Session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function listPending(): Promise<{
  items: PendingItem[];
  count: number;
}> {
  return call<{ items: PendingItem[]; count: number }>(
    '/api/admin/pending',
    { method: 'GET' }
  );
}

export async function getPendingItem(id: string): Promise<{
  item: PendingItem;
  audit_log: AuditLogEntry[];
}> {
  return call<{ item: PendingItem; audit_log: AuditLogEntry[] }>(
    `/api/admin/pending/${encodeURIComponent(id)}`,
    { method: 'GET' }
  );
}

export async function approvePendingItem(id: string): Promise<{ success: true }> {
  return call<{ success: true }>(
    `/api/admin/pending/${encodeURIComponent(id)}/approve`,
    { method: 'POST' }
  );
}

export async function quickApprovePendingItem(id: string): Promise<{ success: true }> {
  return call<{ success: true }>(
    `/api/admin/pending/${encodeURIComponent(id)}/quick-approve`,
    { method: 'POST' }
  );
}

export async function rejectPendingItem(id: string): Promise<{ success: true }> {
  return call<{ success: true }>(
    `/api/admin/pending/${encodeURIComponent(id)}/reject`,
    { method: 'POST' }
  );
}

export async function savePendingItemEdits(
  id: string,
  edits: PendingItemEdits
): Promise<{ success: true }> {
  return call<{ success: true }>(
    `/api/admin/pending/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: edits }
  );
}

export async function regeneratePendingItem(id: string): Promise<{ success: true }> {
  return call<{ success: true }>(
    `/api/admin/pending/${encodeURIComponent(id)}/regenerate`,
    { method: 'POST' }
  );
}
