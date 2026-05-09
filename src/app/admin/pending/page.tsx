'use client';

// Phase 5 admin pending dashboard — list view.
//
// Shows all items where status='pending' (strict equality — legacy NULL
// rows stay invisible per Decisions Log v1.1 Addendum). Quick Approve
// is gated by ai_confidence_score >= 0.8 AND no ai_flags AND no admin
// overrides — the server re-checks the same rule, so the client gate
// is purely UX (tooltip + grayed button).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { AdminLogin } from '../components/AdminLogin';
import {
  listPending,
  quickApprovePendingItem,
} from '@/lib/admin-pending-api';
import { CATEGORIES } from '@/lib/constants';
import type { PendingItem, PendingFilter } from './types';
import { hasAnyAdminOverride } from './lib/eligibility';

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function ConfidenceDot({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color =
    s >= 0.8 ? 'bg-green-500' : s >= 0.6 ? 'bg-yellow' : 'bg-red-500';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}
      title={`Confidence: ${(s * 100).toFixed(0)}%`}
    />
  );
}

function FlagChips({ flags }: { flags: string[] | null }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {flags.map((f) => (
        <span
          key={f}
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700"
          title={f}
        >
          <AlertTriangle size={10} />
          {f}
        </span>
      ))}
    </div>
  );
}

interface CardProps {
  item: PendingItem;
  onQuickApprove: (id: string) => void;
  busy: boolean;
}

function PendingCard({ item, onQuickApprove, busy }: CardProps) {
  const eligible =
    (item.ai_confidence_score ?? 0) >= 0.8 &&
    (!item.ai_flags || item.ai_flags.length === 0) &&
    !hasAnyAdminOverride(item);

  const title =
    item.admin_seo_title ||
    item.ai_seo_title ||
    item.ai_item_name ||
    `Item ${item.id.slice(0, 8)}`;

  const thumb = item.worker_photo_brand_url;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      <Link
        href={`/admin/pending/${item.id}`}
        className="relative aspect-square bg-gray-100"
      >
        {thumb ? (
          <Image
            src={thumb}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-xs">
            No photo
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-1.5 flex-grow">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight line-clamp-2 flex-grow">
            {title}
          </h3>
          <ConfidenceDot score={item.ai_confidence_score} />
        </div>
        <div className="text-[11px] text-muted">
          {item.worker_id ?? 'unknown'} · {item.worker_shop_id ?? '—'} ·{' '}
          {fmtRelative(item.worker_submitted_at)}
        </div>
        <FlagChips flags={item.ai_flags} />

        <div className="mt-auto pt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!eligible || busy}
            onClick={() => onQuickApprove(item.id)}
            className={`px-2 py-2 text-xs font-bold rounded-lg active:scale-95 transition ${
              eligible
                ? 'bg-yellow text-black hover:brightness-105'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title={
              eligible
                ? 'Quick Approve (one tap)'
                : 'Open Review — confidence too low, has flags, or admin overrides set'
            }
          >
            Quick Approve
          </button>
          <Link
            href={`/admin/pending/${item.id}`}
            className="px-2 py-2 text-xs font-bold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 text-center"
          >
            Review
          </Link>
        </div>
      </div>
    </div>
  );
}

interface Toast {
  id: number;
  type: 'ok' | 'err';
  msg: string;
}

export default function AdminPendingPage() {
  const { pin, setPin, user, loginError, loginLoading, handleLogin, logout } =
    useAdminAuth();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PendingFilter>('all');
  const [shopFilter, setShopFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: 'ok' | 'err', msg: string) => {
    const id = Date.now() + Math.random();
    setToast({ id, type, msg });
    setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, 3500);
  }, []);

  const fetchItems = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const data = await listPending();
        setItems(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (user) fetchItems();
  }, [user, fetchItems]);

  const handleQuickApprove = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await quickApprovePendingItem(id);
        showToast('ok', 'Published');
        // Optimistically drop the row from the list — server is the truth
        // but the user just acted on it, no need to wait for a refetch.
        setItems((prev) => prev.filter((i) => i.id !== id));
      } catch (err) {
        showToast('err', err instanceof Error ? err.message : 'Failed');
      } finally {
        setBusyId(null);
      }
    },
    [showToast]
  );

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (filter === 'needs_review') {
        const hasFlag = Array.isArray(it.ai_flags) && it.ai_flags.length > 0;
        const lowConf = (it.ai_confidence_score ?? 0) < 0.8;
        if (!hasFlag && !lowConf) return false;
      }
      if (filter === 'quick_eligible') {
        const eligible =
          (it.ai_confidence_score ?? 0) >= 0.8 &&
          (!it.ai_flags || it.ai_flags.length === 0) &&
          !hasAnyAdminOverride(it);
        if (!eligible) return false;
      }
      if (shopFilter && it.worker_shop_id !== shopFilter) return false;
      if (categoryFilter) {
        const cat = it.admin_category ?? it.ai_category;
        if (cat !== categoryFilter) return false;
      }
      return true;
    });
  }, [items, filter, shopFilter, categoryFilter]);

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

  return (
    <div className="pt-20 pb-16 min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg max-w-[90vw] flex items-center gap-2 ${
            toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-muted hover:text-black flex items-center gap-1 text-sm"
            >
              <ArrowLeft size={16} /> Legacy
            </Link>
            <div>
              <h1 className="font-heading text-2xl">
                PENDING <span className="text-yellow">REVIEW</span>{' '}
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-yellow text-black align-middle">
                  BETA
                </span>
              </h1>
              <p className="text-muted text-xs">
                {user} · {items.length} pending
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchItems({ silent: true })}
              disabled={refreshing}
              className="text-muted hover:text-black flex items-center gap-1 text-sm"
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={logout}
              className="text-muted hover:text-black text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
            {(
              [
                ['all', 'All'],
                ['needs_review', 'Needs Review'],
                ['quick_eligible', 'Quick Approve'],
              ] as Array<[PendingFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  filter === key
                    ? 'bg-yellow text-black'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white"
          >
            <option value="">All shops</option>
            {['BF1', 'BF2', 'BF3', 'BF4', 'BF5'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-yellow" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-600 text-sm font-semibold mb-2">{error}</p>
            <button
              onClick={() => fetchItems()}
              className="text-sm underline text-muted"
            >
              Retry
            </button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-heading text-2xl mb-1">NOTHING TO REVIEW</p>
            <p className="text-muted text-sm">
              {items.length === 0
                ? 'The queue is empty.'
                : 'No items match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleItems.map((item) => (
              <PendingCard
                key={item.id}
                item={item}
                onQuickApprove={handleQuickApprove}
                busy={busyId === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
