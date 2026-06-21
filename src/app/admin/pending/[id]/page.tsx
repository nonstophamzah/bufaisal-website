'use client';

// Phase 5 admin pending dashboard — detail editor (full page).
//
// Mobile-first single-column scroll. Each editable field shows the AI
// value as the default. When admin types in a value, it's tracked as an
// override (writes to admin_*). The "AI suggested" pill appears
// underneath any field with an active override; tap it to revert.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { AdminLogin } from '../../components/AdminLogin';
import {
  approvePendingItem,
  getPendingItem,
  regeneratePendingItem,
  rejectPendingItem,
  savePendingItemEdits,
} from '@/lib/admin-pending-api';
import { CATEGORIES } from '@/lib/constants';
import type {
  AuditLogEntry,
  PendingItem,
  PendingItemEdits,
} from '../types';

// PRODUCT_TYPE_VOCABULARY mirrored from the locked listing-generator
// prompt v1.0.1. Kept here as a flat list for the dropdown — admin can
// override the AI's choice but the options come from this canonical list.
const PRODUCT_TYPES: string[] = [
  // Appliances
  'Refrigerator',
  'Freezer',
  'Washing Machine',
  'Dryer',
  'Dishwasher',
  'Microwave',
  'Oven',
  'Stove',
  'AC Unit',
  'Water Heater',
  'Vacuum Cleaner',
  'Fan',
  'Small Appliance',
  // Bedroom
  'Bed Frame',
  'Mattress',
  'Wardrobe',
  'Dresser',
  'Nightstand',
  'Bedroom Set',
  // Living Room
  'Sofa',
  'Sectional Sofa',
  'Armchair',
  'Coffee Table',
  'TV Stand',
  'Living Room Set',
  // Dining & Kitchen
  'Dining Table',
  'Dining Chair',
  'Dining Set',
  'Kitchen Cabinet',
  'Cookware',
  'Dishware',
  // Kids & Baby
  'Crib',
  'High Chair',
  'Stroller',
  'Kids Bed',
  'Kids Toy',
  'Kids Clothing',
  // Outdoor & Garden
  'Patio Set',
  'Garden Tool',
  'BBQ Grill',
  'Outdoor Chair',
  'Pool Equipment',
  // Office & Fitness
  'Desk',
  'Office Chair',
  'Filing Cabinet',
  'Treadmill',
  'Exercise Bike',
  'Study Set',
  // Shoe Racks & Shelves
  'Lamp',
  'Mirror',
  'Decor',
  'Storage',
  'Other',
];

// Trust signals whitelist mirrored from the prompt. Admin selects from
// this list — same constraint the AI is bound to.
const TRUST_SIGNAL_WHITELIST: string[] = [
  'Since 2009 — UAE’s largest used goods market',
  '5 showrooms in Ajman',
  'Delivery in all 7 emirates',
  'All items inspected',
  '24-48hr delivery',
  'Cash on delivery accepted',
  'Tested by our team before listing',
  '7-day warranty included',
  'Anything wrong, we fix it',
  'Trucks include carpenters for free assembly at your home',
  'Made by Bufaisal — any issue, our call center resolves it',
  'Repaired and tested at our Jurf facility',
];

// ──────────────────────────────────────────────────────────────────
// Field components
// ──────────────────────────────────────────────────────────────────

interface FieldShellProps {
  label: string;
  aiValue: unknown;
  hasOverride: boolean;
  onReset: () => void;
  children: React.ReactNode;
  // Defaults to "AI suggested" — the body text fields fall back to ai_*.
  // Phase 8 price/negotiable/grade fall back to worker_*, so they pass
  // "Worker submitted" here.
  sourceLabel?: string;
}

function FieldShell({
  label,
  aiValue,
  hasOverride,
  onReset,
  children,
  sourceLabel = 'AI suggested',
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-600">
        {label}
      </label>
      {children}
      {hasOverride && (
        <button
          type="button"
          onClick={onReset}
          className="self-start text-[11px] text-yellow-700 hover:underline flex items-center gap-1"
          title="Discard your edit and use the default value"
        >
          <RefreshCw size={10} />
          {sourceLabel}:{' '}
          <span className="text-gray-600 truncate max-w-[200px]">
            {aiValue === null || aiValue === undefined || aiValue === ''
              ? '(empty)'
              : typeof aiValue === 'string'
                ? aiValue
                : typeof aiValue === 'boolean'
                  ? aiValue
                    ? 'Yes'
                    : 'No'
                  : typeof aiValue === 'number'
                    ? `${aiValue}`
                    : JSON.stringify(aiValue).slice(0, 60)}
          </span>{' '}
          — Reset
        </button>
      )}
    </div>
  );
}

// Phase 8 PR 1 — small pill button used by the Negotiable + Condition
// Grade selectors. Same visual language as the /team worker upload
// pills but scaled down for the admin editor.
function AdminPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-2 rounded-lg font-semibold text-sm border-2 active:scale-95 transition-transform ${
        active
          ? 'bg-yellow text-black border-yellow'
          : 'bg-white text-gray-700 border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

// Track edits as a draft state. Each draft entry is either the admin's
// new value or undefined (meaning "no override — use AI"). Saving sends
// the diff against the current row to PATCH.
type EditState = Record<string, unknown>;

// ──────────────────────────────────────────────────────────────────
// Page component
// ──────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: 'ok' | 'err';
  msg: string;
}

export default function PendingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { pin, setPin, user, loginError, loginLoading, handleLogin, logout } =
    useAdminAuth();

  const [item, setItem] = useState<PendingItem | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<EditState>({});
  const [busy, setBusy] = useState<null | 'approve' | 'save' | 'regenerate' | 'reject'>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<null | 'regenerate' | 'reject'>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const showToast = useCallback((type: 'ok' | 'err', msg: string) => {
    const tid = Date.now() + Math.random();
    setToast({ id: tid, type, msg });
    setTimeout(() => {
      setToast((t) => (t?.id === tid ? null : t));
    }, 3500);
  }, []);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPendingItem(id);
      setItem(data.item);
      setAuditLog(data.audit_log);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user && id) fetchItem();
  }, [user, id, fetchItem]);

  // ── Field helpers ─────────────────────────────────────────────
  // For each field, the displayed value is: edit-draft (if present) →
  // admin_* (if persisted override) → ai_* (default).

  const valueOf = useCallback(
    (adminKey: keyof PendingItem, aiKey: keyof PendingItem) => {
      if (!item) return undefined;
      if (adminKey in edits) return edits[adminKey as string];
      const adminVal = item[adminKey];
      if (adminVal !== null && adminVal !== undefined) return adminVal;
      return item[aiKey];
    },
    [edits, item]
  );

  const hasOverride = useCallback(
    (adminKey: keyof PendingItem) => {
      if (!item) return false;
      if (adminKey in edits) {
        // An explicit edit is an override unless the user typed back the AI value.
        return edits[adminKey as string] !== null;
      }
      return item[adminKey] !== null && item[adminKey] !== undefined;
    },
    [edits, item]
  );

  const setField = useCallback((adminKey: string, value: unknown) => {
    setEdits((prev) => ({ ...prev, [adminKey]: value }));
  }, []);

  const resetField = useCallback(
    (adminKey: keyof PendingItem) => {
      // Send null on save to clear the persisted override; locally drop
      // any draft edit so the displayed value falls back to ai_*.
      setEdits((prev) => {
        const next = { ...prev };
        if (item && (item[adminKey] !== null && item[adminKey] !== undefined)) {
          // There's a persisted override → must explicitly null it on save.
          next[adminKey as string] = null;
        } else {
          // Only a local draft → just drop it.
          delete next[adminKey as string];
        }
        return next;
      });
    },
    [item]
  );

  const dirty = Object.keys(edits).length > 0;

  // ── Action handlers ───────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!id || !dirty) return;
    setBusy('save');
    try {
      await savePendingItemEdits(id, edits as PendingItemEdits);
      showToast('ok', 'Edits saved');
      await fetchItem();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }, [id, dirty, edits, showToast, fetchItem]);

  const handleApprove = useCallback(async () => {
    if (!id) return;
    // If the admin has unsaved edits, save them first so the approve
    // step picks up the latest admin_* values.
    if (dirty) {
      setBusy('save');
      try {
        await savePendingItemEdits(id, edits as PendingItemEdits);
      } catch (err) {
        setBusy(null);
        showToast('err', err instanceof Error ? err.message : 'Save failed');
        return;
      }
    }
    setBusy('approve');
    try {
      await approvePendingItem(id);
      showToast('ok', 'Published');
      router.push('/admin/pending');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Publish failed');
      setBusy(null);
    }
  }, [id, dirty, edits, showToast, router]);

  const handleRegenerate = useCallback(async () => {
    if (!id) return;
    setBusy('regenerate');
    try {
      await regeneratePendingItem(id);
      showToast('ok', 'AI regeneration started — check back in ~30s');
      router.push('/admin/pending');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Regenerate failed');
      setBusy(null);
    }
  }, [id, showToast, router]);

  const handleReject = useCallback(async () => {
    if (!id) return;
    setBusy('reject');
    try {
      await rejectPendingItem(id);
      showToast('ok', 'Rejected');
      router.push('/admin/pending');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Reject failed');
      setBusy(null);
    }
  }, [id, showToast, router]);

  // ── Render guards ─────────────────────────────────────────────

  if (!user) {
    return (
      <AdminLogin
        pin={pin}
        setPin={setPin}
        loginError={loginError}
        loginLoading={loginLoading}
        onLogin={handleLogin}
        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
      />
    );
  }

  if (loading || !item) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center">
        {error ? (
          <div className="text-center">
            <p className="text-red-600 text-sm font-semibold mb-2">{error}</p>
            <Link href="/admin/pending" className="text-sm underline text-muted">
              Back to queue
            </Link>
          </div>
        ) : (
          <Loader2 size={28} className="animate-spin text-yellow" />
        )}
      </div>
    );
  }

  const photos = [
    { label: 'Brand', url: item.worker_photo_brand_url },
    { label: 'Photo 2', url: item.worker_photo_2_url },
    { label: 'Photo 3', url: item.worker_photo_3_url },
    { label: 'Barcode', url: item.worker_photo_barcode_url },
  ];

  return (
    <div className="pt-16 pb-32 min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg max-w-[90vw] flex items-center gap-2 ${
            toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <button
          type="button"
          aria-label="Close photo"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <Image
            src={lightbox}
            alt="Item photo"
            width={1600}
            height={1600}
            className="max-w-full max-h-full object-contain"
            sizes="100vw"
          />
          <X size={28} className="absolute top-4 right-4 text-white" />
        </button>
      )}

      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between py-3">
          <Link
            href="/admin/pending"
            className="text-muted hover:text-black flex items-center gap-1 text-sm"
          >
            <ArrowLeft size={16} /> Back to queue
          </Link>
          <button onClick={logout} className="text-muted text-sm">
            Logout
          </button>
        </div>

        {/* Photos */}
        <section className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
            Photos
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p) => (
              <div key={p.label} className="relative">
                <button
                  type="button"
                  onClick={() => p.url && setLightbox(p.url)}
                  className="relative aspect-square w-full bg-gray-100 rounded-lg overflow-hidden block"
                  disabled={!p.url}
                >
                  {p.url ? (
                    <Image
                      src={p.url}
                      alt={p.label}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                      Missing
                    </div>
                  )}
                </button>
                <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
          {item.ai_barcode_extracted && (
            <p className="text-xs text-muted mt-2">
              Barcode extracted by AI:{' '}
              <span className="font-mono font-semibold text-black">
                {item.ai_barcode_extracted}
              </span>
            </p>
          )}
        </section>

        {/* Worker info + flags + confidence */}
        <section className="mb-5 bg-white border border-gray-200 rounded-xl p-3 text-xs">
          <div className="grid grid-cols-2 gap-y-1 gap-x-3">
            <div>
              <span className="text-muted">Worker:</span>{' '}
              <span className="font-semibold">{item.worker_id ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted">Shop:</span>{' '}
              <span className="font-semibold">{item.worker_shop_id ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted">Submitted:</span>{' '}
              <span className="font-semibold">
                {item.worker_submitted_at
                  ? new Date(item.worker_submitted_at).toLocaleString('en-GB')
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-muted">Worker price:</span>{' '}
              <span className="font-semibold">
                {item.worker_price_aed ?? '—'} AED
              </span>
            </div>
            <div>
              <span className="text-muted">Worker condition:</span>{' '}
              <span className="font-semibold">
                {item.worker_condition_type}
                {item.worker_condition_grade ? ` — ${item.worker_condition_grade}` : ''}
              </span>
            </div>
            <div>
              <span className="text-muted">Confidence:</span>{' '}
              <span className="font-semibold">
                {item.ai_confidence_score !== null
                  ? `${(item.ai_confidence_score * 100).toFixed(0)}%`
                  : '—'}
              </span>
            </div>
          </div>
          {item.worker_note && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <span className="text-muted">Worker note:</span>{' '}
              <span className="italic">{item.worker_note}</span>
            </div>
          )}
          {item.ai_flags && item.ai_flags.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <span className="text-muted">Flags:</span>{' '}
              {item.ai_flags.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 mr-1"
                  title={f}
                >
                  <AlertTriangle size={10} />
                  {f}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Editable fields */}
        <section className="mb-5 bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600">
            Listing — edit any field, or leave AI value
          </h2>

          <FieldShell
            label="Brand"
            aiValue={item.ai_brand}
            hasOverride={hasOverride('admin_brand')}
            onReset={() => resetField('admin_brand')}
          >
            <input
              type="text"
              value={(valueOf('admin_brand', 'ai_brand') as string | null) ?? ''}
              onChange={(e) => setField('admin_brand', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              placeholder="(empty)"
            />
          </FieldShell>

          <FieldShell
            label="Item Name"
            aiValue={item.ai_item_name}
            hasOverride={hasOverride('admin_item_name')}
            onReset={() => resetField('admin_item_name')}
          >
            <input
              type="text"
              value={(valueOf('admin_item_name', 'ai_item_name') as string | null) ?? ''}
              onChange={(e) => setField('admin_item_name', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
          </FieldShell>

          {/* Phase 8 PR 1 — admin can override the worker-submitted price,
              negotiable flag, and (for Used items) condition grade. These
              fields fall back to worker_* rather than ai_*, so the reset
              link says "Worker submitted: X" instead of "AI suggested". */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldShell
              label="Price (AED)"
              aiValue={item.worker_price_aed}
              hasOverride={hasOverride('admin_price_aed')}
              onReset={() => resetField('admin_price_aed')}
              sourceLabel="Worker submitted"
            >
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={(() => {
                  const v = valueOf('admin_price_aed', 'worker_price_aed');
                  return v === null || v === undefined ? '' : String(v);
                })()}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setField('admin_price_aed', null);
                    return;
                  }
                  const n = Number.parseInt(raw, 10);
                  if (Number.isInteger(n) && n >= 1) {
                    setField('admin_price_aed', n);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                placeholder="(empty)"
              />
            </FieldShell>

            <FieldShell
              label="Negotiable"
              aiValue={item.worker_negotiable}
              hasOverride={hasOverride('admin_negotiable')}
              onReset={() => resetField('admin_negotiable')}
              sourceLabel="Worker submitted"
            >
              {(() => {
                const current = valueOf('admin_negotiable', 'worker_negotiable') as
                  | boolean
                  | null
                  | undefined;
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <AdminPill
                      active={current === true}
                      onClick={() => setField('admin_negotiable', true)}
                    >
                      Yes
                    </AdminPill>
                    <AdminPill
                      active={current === false}
                      onClick={() => setField('admin_negotiable', false)}
                    >
                      No
                    </AdminPill>
                  </div>
                );
              })()}
            </FieldShell>
          </div>

          {item.worker_condition_type === 'Used' && (
            <FieldShell
              label={`Condition Grade (worker said: ${item.worker_condition_grade ?? '—'})`}
              aiValue={item.worker_condition_grade}
              hasOverride={hasOverride('admin_condition_grade')}
              onReset={() => resetField('admin_condition_grade')}
              sourceLabel="Worker submitted"
            >
              {(() => {
                const current = valueOf(
                  'admin_condition_grade',
                  'worker_condition_grade'
                ) as 'Excellent' | 'Good' | 'Fair' | null | undefined;
                return (
                  <div className="grid grid-cols-3 gap-2">
                    {(['Excellent', 'Good', 'Fair'] as const).map((g) => (
                      <AdminPill
                        key={g}
                        active={current === g}
                        onClick={() => setField('admin_condition_grade', g)}
                      >
                        {g}
                      </AdminPill>
                    ))}
                  </div>
                );
              })()}
            </FieldShell>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldShell
              label="Category"
              aiValue={item.ai_category}
              hasOverride={hasOverride('admin_category')}
              onReset={() => resetField('admin_category')}
            >
              <select
                value={(valueOf('admin_category', 'ai_category') as string | null) ?? ''}
                onChange={(e) => setField('admin_category', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="">(none)</option>
                {/* AI may have emitted a label that does not match constants
                    (the prompt and constants disagree on "Office /" vs "Office,").
                    Show it as-is if so. */}
                {item.ai_category &&
                  !CATEGORIES.some((c) => c.name === item.ai_category) && (
                    <option value={item.ai_category}>
                      {item.ai_category} (AI value)
                    </option>
                  )}
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell
              label="Product Type"
              aiValue={item.ai_product_type}
              hasOverride={hasOverride('admin_product_type')}
              onReset={() => resetField('admin_product_type')}
            >
              <select
                value={
                  (valueOf('admin_product_type', 'ai_product_type') as string | null) ?? ''
                }
                onChange={(e) => setField('admin_product_type', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="">(none)</option>
                {item.ai_product_type &&
                  !PRODUCT_TYPES.includes(item.ai_product_type) && (
                    <option value={item.ai_product_type}>
                      {item.ai_product_type} (AI value)
                    </option>
                  )}
                {PRODUCT_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </FieldShell>
          </div>

          <FieldShell
            label="SEO Title (under 60 chars)"
            aiValue={item.ai_seo_title}
            hasOverride={hasOverride('admin_seo_title')}
            onReset={() => resetField('admin_seo_title')}
          >
            <input
              type="text"
              value={(valueOf('admin_seo_title', 'ai_seo_title') as string | null) ?? ''}
              onChange={(e) => setField('admin_seo_title', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              maxLength={120}
            />
          </FieldShell>

          <FieldShell
            label="Meta Description (140–155 chars)"
            aiValue={item.ai_meta_description}
            hasOverride={hasOverride('admin_meta_description')}
            onReset={() => resetField('admin_meta_description')}
          >
            <textarea
              value={
                (valueOf('admin_meta_description', 'ai_meta_description') as string | null) ?? ''
              }
              onChange={(e) => setField('admin_meta_description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              maxLength={300}
            />
          </FieldShell>

          <FieldShell
            label="Body Description"
            aiValue={item.ai_description}
            hasOverride={hasOverride('admin_description')}
            onReset={() => resetField('admin_description')}
          >
            <textarea
              value={(valueOf('admin_description', 'ai_description') as string | null) ?? ''}
              onChange={(e) => setField('admin_description', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
          </FieldShell>

          <FieldShell
            label="Slug"
            aiValue={item.ai_slug}
            hasOverride={hasOverride('admin_slug')}
            onReset={() => resetField('admin_slug')}
          >
            <input
              type="text"
              value={(valueOf('admin_slug', 'ai_slug') as string | null) ?? ''}
              onChange={(e) => setField('admin_slug', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
            />
          </FieldShell>

          {/* Spec table editor */}
          <SpecTableEditor
            ai={item.ai_spec_table ?? null}
            adminPersisted={item.admin_spec_table ?? null}
            draft={
              'admin_spec_table' in edits
                ? (edits.admin_spec_table as Record<string, unknown> | null)
                : undefined
            }
            onChange={(v) => setField('admin_spec_table', v)}
            onReset={() => resetField('admin_spec_table')}
            hasOverride={hasOverride('admin_spec_table')}
          />

          {/* FAQs editor */}
          <FaqsEditor
            ai={item.ai_faqs ?? null}
            adminPersisted={item.admin_faqs ?? null}
            draft={
              'admin_faqs' in edits
                ? (edits.admin_faqs as Array<{ question: string; answer: string }> | null)
                : undefined
            }
            onChange={(v) => setField('admin_faqs', v)}
            onReset={() => resetField('admin_faqs')}
            hasOverride={hasOverride('admin_faqs')}
          />

          {/* Trust signals */}
          <TrustSignalsEditor
            ai={item.ai_trust_signals ?? null}
            adminPersisted={item.admin_trust_signals ?? null}
            draft={
              'admin_trust_signals' in edits
                ? (edits.admin_trust_signals as string[] | null)
                : undefined
            }
            onChange={(v) => setField('admin_trust_signals', v)}
            onReset={() => resetField('admin_trust_signals')}
            hasOverride={hasOverride('admin_trust_signals')}
          />
        </section>

        {/* Audit log */}
        {auditLog.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              History ({auditLog.length})
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {auditLog.map((entry) => (
                <div key={entry.id} className="px-3 py-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{entry.action}</span>
                    <span className="text-muted">
                      {new Date(entry.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <div className="text-muted mt-0.5">
                    {entry.actor_type}
                    {entry.actor_id ? ` · ${entry.actor_id}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Confirm modal */}
        {confirm && (
          <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full">
              <h3 className="font-heading text-lg mb-2">
                {confirm === 'regenerate' ? 'Regenerate AI listing?' : 'Reject this item?'}
              </h3>
              <p className="text-sm text-muted mb-4">
                {confirm === 'regenerate'
                  ? 'Current AI output will be replaced. Your manual edits in admin override fields will be preserved. Cloudinary photos stay where they are.'
                  : 'Item will be archived and removed from the public site. Cloudinary photos stay where they are.'}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = confirm;
                    setConfirm(null);
                    if (action === 'regenerate') handleRegenerate();
                    else handleReject();
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
                    confirm === 'regenerate' ? 'bg-blue-600' : 'bg-red-600'
                  }`}
                >
                  {confirm === 'regenerate' ? 'Regenerate' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-md z-30">
        <div className="max-w-3xl mx-auto px-3 py-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy !== null}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-yellow text-black font-bold text-sm active:scale-95 disabled:opacity-50"
          >
            {busy === 'approve' || busy === 'save' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Approve & Publish
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy !== null || !dirty}
            className="px-3 py-3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
            title={dirty ? 'Save edits without publishing' : 'No changes to save'}
          >
            <Save size={16} /> Save
          </button>
          <button
            type="button"
            onClick={() => setConfirm('regenerate')}
            disabled={busy !== null}
            className="px-3 py-3 rounded-lg border border-gray-200 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy === 'regenerate' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => setConfirm('reject')}
            disabled={busy !== null}
            className="px-3 py-3 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 active:scale-95 disabled:opacity-40"
          >
            {busy === 'reject' ? <Loader2 size={16} className="animate-spin" /> : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub-component: Spec Table editor (key/value rows)
// ──────────────────────────────────────────────────────────────────

interface SpecTableEditorProps {
  ai: Record<string, unknown> | null;
  adminPersisted: Record<string, unknown> | null;
  draft: Record<string, unknown> | null | undefined;
  onChange: (v: Record<string, string> | null) => void;
  onReset: () => void;
  hasOverride: boolean;
}

function SpecTableEditor({
  ai,
  adminPersisted,
  draft,
  onChange,
  onReset,
  hasOverride,
}: SpecTableEditorProps) {
  // Source-of-truth: draft → adminPersisted → ai. Coerce all values to
  // strings for the input UI; admin can free-form anything.
  const rows: Array<[string, string]> = useMemo(() => {
    const initial = draft !== undefined ? draft : (adminPersisted ?? ai ?? {});
    if (!initial) return [];
    return Object.entries(initial).map(([k, v]) => [k, String(v ?? '')]);
  }, [draft, adminPersisted, ai]);

  const update = useCallback(
    (next: Array<[string, string]>) => {
      const obj: Record<string, string> = {};
      for (const [k, v] of next) {
        if (k.trim()) obj[k.trim()] = v;
      }
      onChange(obj);
    },
    [onChange]
  );

  return (
    <FieldShell label="Spec Table" aiValue={ai} hasOverride={hasOverride} onReset={onReset}>
      <div className="flex flex-col gap-1.5">
        {rows.map(([k, v], i) => (
          <div key={`${i}-${k}`} className="flex gap-1">
            <input
              type="text"
              value={k}
              onChange={(e) => {
                const next = [...rows];
                next[i] = [e.target.value, v];
                update(next);
              }}
              placeholder="Key"
              className="w-1/3 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold"
            />
            <input
              type="text"
              value={v}
              onChange={(e) => {
                const next = [...rows];
                next[i] = [k, e.target.value];
                update(next);
              }}
              placeholder="Value"
              className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const next = rows.filter((_, idx) => idx !== i);
                update(next);
              }}
              className="px-2 text-red-600 text-xs"
              aria-label="Remove row"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update([...rows, ['', '']])}
          className="self-start text-[11px] text-blue-700 hover:underline mt-1"
        >
          + Add row
        </button>
      </div>
    </FieldShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub-component: FAQs editor (4 rows: question + answer)
// ──────────────────────────────────────────────────────────────────

interface FaqsEditorProps {
  ai: Array<{ question: string; answer: string }> | null;
  adminPersisted: Array<{ question: string; answer: string }> | null;
  draft: Array<{ question: string; answer: string }> | null | undefined;
  onChange: (v: Array<{ question: string; answer: string }>) => void;
  onReset: () => void;
  hasOverride: boolean;
}

function FaqsEditor({
  ai,
  adminPersisted,
  draft,
  onChange,
  onReset,
  hasOverride,
}: FaqsEditorProps) {
  const source = draft !== undefined ? draft : (adminPersisted ?? ai ?? []);
  const faqs = source ?? [];

  const updateAt = (i: number, field: 'question' | 'answer', val: string) => {
    const next = faqs.map((f, idx) => (idx === i ? { ...f, [field]: val } : f));
    onChange(next);
  };

  return (
    <FieldShell
      label="FAQs (locked structure: 4 entries)"
      aiValue={ai ? `${ai.length} entries` : '(none)'}
      hasOverride={hasOverride}
      onReset={onReset}
    >
      <div className="flex flex-col gap-2">
        {faqs.length === 0 && (
          <p className="text-xs text-muted italic">No FAQs from AI.</p>
        )}
        {faqs.map((f, i) => (
          <details key={i} className="bg-gray-50 rounded-lg p-2">
            <summary className="text-xs font-semibold cursor-pointer">
              Q{i + 1}: {f.question || '(empty)'}
            </summary>
            <div className="flex flex-col gap-1.5 mt-2">
              <input
                type="text"
                value={f.question}
                onChange={(e) => updateAt(i, 'question', e.target.value)}
                placeholder="Question"
                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
              />
              <textarea
                value={f.answer}
                onChange={(e) => updateAt(i, 'answer', e.target.value)}
                placeholder="Answer"
                rows={3}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
              />
            </div>
          </details>
        ))}
      </div>
    </FieldShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub-component: Trust Signals (multi-select from whitelist)
// ──────────────────────────────────────────────────────────────────

interface TrustSignalsEditorProps {
  ai: string[] | null;
  adminPersisted: string[] | null;
  draft: string[] | null | undefined;
  onChange: (v: string[]) => void;
  onReset: () => void;
  hasOverride: boolean;
}

function TrustSignalsEditor({
  ai,
  adminPersisted,
  draft,
  onChange,
  onReset,
  hasOverride,
}: TrustSignalsEditorProps) {
  const source = draft !== undefined ? draft : (adminPersisted ?? ai ?? []);
  const selected = new Set(source ?? []);

  const toggle = (signal: string) => {
    const next = new Set(selected);
    if (next.has(signal)) next.delete(signal);
    else next.add(signal);
    onChange(Array.from(next));
  };

  return (
    <FieldShell
      label="Trust Signals (pick from whitelist)"
      aiValue={ai ? `${ai.length} signals` : '(none)'}
      hasOverride={hasOverride}
      onReset={onReset}
    >
      <div className="flex flex-col gap-1">
        {TRUST_SIGNAL_WHITELIST.map((sig) => (
          <label
            key={sig}
            className="flex items-start gap-2 text-xs cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(sig)}
              onChange={() => toggle(sig)}
              className="mt-0.5"
            />
            <span>{sig}</span>
          </label>
        ))}
        {/* Surface any non-whitelist signal the AI emitted (e.g. legacy)
            so the admin can keep or drop it intentionally. */}
        {ai &&
          ai
            .filter((s) => !TRUST_SIGNAL_WHITELIST.includes(s))
            .map((s) => (
              <label
                key={s}
                className="flex items-start gap-2 text-xs cursor-pointer text-orange-700"
              >
                <input
                  type="checkbox"
                  checked={selected.has(s)}
                  onChange={() => toggle(s)}
                  className="mt-0.5"
                />
                <span>
                  {s} <em>(off-whitelist — AI emitted)</em>
                </span>
              </label>
            ))}
      </div>
    </FieldShell>
  );
}
