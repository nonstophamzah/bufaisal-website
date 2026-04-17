'use client';

import { useState } from 'react';
import {
  AlertTriangle, Sparkles, CheckCircle, ChevronDown, ChevronUp,
  Loader2, X, Image as ImageIcon,
} from 'lucide-react';
import { canonicalProductType, canonicalBrand } from '@/lib/appliance-catalog';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  shop: string | null;
  photo_url: string | null;
  cleaning_status?: string | null;
  cleaned_by?: string | null;
  date_cleaning_claimed?: string | null;
  date_cleaned?: string | null;
  cleaning_flagged?: boolean | null;
  cleaning_flag_note?: string | null;
  cleaning_flagged_at?: string | null;
  before_cleaning_photos?: string[] | null;
  after_cleaning_photos?: string[] | null;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const sent = new Date(dateStr);
  const mins = Math.floor((Date.now() - sent.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CleaningActivity({
  flaggedItems,
  inCleaningItems,
  cleaningPendingItems,
  recentlyCleaned,
  onClearFlag,
  clearingFlag,
  sectionId,
}: {
  flaggedItems: Item[];
  inCleaningItems: Item[];
  cleaningPendingItems: Item[];
  recentlyCleaned: Item[];
  onClearFlag: (id: string) => void;
  clearingFlag: string | null;
  sectionId?: string;
}) {
  const [showPhotos, setShowPhotos] = useState<string | null>(null);

  // If nothing at all is happening, show a thin "no activity" note so
  // the manager knows the section exists and is healthy.
  const totalActivity =
    flaggedItems.length + inCleaningItems.length + cleaningPendingItems.length + recentlyCleaned.length;

  return (
    <div id={sectionId} className="px-4 pt-6 pb-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-xl text-white">
          CLEANING <span className="text-cyan-400">ACTIVITY</span>
        </h2>
        <div className="text-xs text-gray-500">
          {flaggedItems.length} flagged · {inCleaningItems.length} active · {cleaningPendingItems.length} waiting
        </div>
      </div>

      {totalActivity === 0 && (
        <div className="rounded-xl bg-[#1a1a1a] border border-gray-800 p-4 text-center">
          <p className="text-sm text-gray-500">No cleaning activity right now</p>
        </div>
      )}

      {/* ═══ FLAGGED (most urgent) ═══ */}
      {flaggedItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Flagged by cleaner ({flaggedItems.length})
            </p>
          </div>
          <div className="space-y-2">
            {flaggedItems.map((item) => (
              <FlaggedCard
                key={item.id}
                item={item}
                onClearFlag={onClearFlag}
                clearingFlag={clearingFlag}
                onViewPhotos={() => setShowPhotos(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ IN PROGRESS ═══ */}
      {inCleaningItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-cyan-400" />
            <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Being cleaned now ({inCleaningItems.length})
            </p>
          </div>
          <div className="space-y-2">
            {inCleaningItems.map((item) => (
              <ActivityCard key={item.id} item={item} tone="cyan">
                <p className="text-xs text-gray-400">
                  {item.cleaned_by || 'Cleaner'} · claimed {timeAgo(item.date_cleaning_claimed)}
                </p>
              </ActivityCard>
            ))}
          </div>
        </div>
      )}

      {/* ═══ AWAITING CLEANER (repaired but no one claimed) ═══ */}
      {cleaningPendingItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-orange-400" />
            <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">
              Waiting for cleaner to claim ({cleaningPendingItems.length})
            </p>
          </div>
          <div className="space-y-2">
            {cleaningPendingItems.map((item) => (
              <ActivityCard key={item.id} item={item} tone="orange">
                <p className="text-xs text-gray-400">Ready to be cleaned</p>
              </ActivityCard>
            ))}
          </div>
        </div>
      )}

      {/* ═══ RECENTLY CLEANED ═══ */}
      {recentlyCleaned.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-green-400" />
            <p className="text-xs font-bold text-green-400 uppercase tracking-wider">
              Cleaned in last 24h ({recentlyCleaned.length})
            </p>
          </div>
          <div className="space-y-2">
            {recentlyCleaned.slice(0, 10).map((item) => (
              <ActivityCard
                key={item.id}
                item={item}
                tone="green"
                onViewPhotos={() => setShowPhotos(item.id)}
              >
                <p className="text-xs text-gray-400">
                  {item.cleaned_by || 'Cleaner'} · {timeAgo(item.date_cleaned)}
                </p>
              </ActivityCard>
            ))}
            {recentlyCleaned.length > 10 && (
              <p className="text-xs text-gray-500 text-center pt-1">
                + {recentlyCleaned.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Photo viewer modal */}
      {showPhotos && (
        <PhotosModal
          item={
            [...flaggedItems, ...inCleaningItems, ...recentlyCleaned].find((i) => i.id === showPhotos) || null
          }
          onClose={() => setShowPhotos(null)}
        />
      )}
    </div>
  );
}

// ─────────────────── Sub-components ───────────────────

function ActivityCard({
  item,
  tone,
  onViewPhotos,
  children,
}: {
  item: Item;
  tone: 'cyan' | 'orange' | 'green';
  onViewPhotos?: () => void;
  children: React.ReactNode;
}) {
  const border =
    tone === 'cyan' ? 'border-cyan-500/30' : tone === 'orange' ? 'border-orange-500/30' : 'border-green-500/30';
  const before = item.before_cleaning_photos?.filter(Boolean).length || 0;
  const after = item.after_cleaning_photos?.filter(Boolean).length || 0;

  return (
    <div className={`rounded-xl bg-[#1a1a1a] border ${border} p-3`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#0a0a0a] overflow-hidden flex-shrink-0">
          {item.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white truncate">
            {canonicalProductType(item.product_type)}
            {item.brand ? ` — ${canonicalBrand(item.brand)}` : ''}
          </p>
          <p className="text-xs text-gray-500">
            {item.barcode} · Shop {item.shop || '—'}
          </p>
          {children}
        </div>
        {onViewPhotos && (before > 0 || after > 0) && (
          <button
            onClick={onViewPhotos}
            className="flex items-center gap-1 text-xs text-cyan-400 px-2 py-1.5 rounded-lg bg-cyan-500/10"
          >
            <ImageIcon size={12} /> {before + after}
          </button>
        )}
      </div>
    </div>
  );
}

function FlaggedCard({
  item,
  onClearFlag,
  clearingFlag,
  onViewPhotos,
}: {
  item: Item;
  onClearFlag: (id: string) => void;
  clearingFlag: string | null;
  onViewPhotos: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const before = item.before_cleaning_photos?.filter(Boolean).length || 0;
  const after = item.after_cleaning_photos?.filter(Boolean).length || 0;
  const isClearing = clearingFlag === item.id;

  return (
    <div className="rounded-xl bg-amber-500/10 border border-amber-500/40">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-[#0a0a0a] overflow-hidden flex-shrink-0">
          {item.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white truncate">
            {canonicalProductType(item.product_type)}
            {item.brand ? ` — ${canonicalBrand(item.brand)}` : ''}
          </p>
          <p className="text-xs text-amber-300">
            Flagged by {item.cleaned_by || 'Cleaner'} · {timeAgo(item.cleaning_flagged_at)}
          </p>
        </div>
        {expanded ? <ChevronUp size={18} className="text-amber-400" /> : <ChevronDown size={18} className="text-amber-400" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-amber-500/20 space-y-3">
          <div className="text-sm text-white bg-black/40 rounded-lg p-3">
            <p className="text-xs font-bold text-amber-400 mb-1">CLEANER&apos;S NOTE</p>
            {item.cleaning_flag_note || '(no note — manager should ask cleaner directly)'}
          </div>
          <div className="text-xs text-gray-400">
            <span className="font-bold">Barcode:</span> {item.barcode} · <span className="font-bold">Shop:</span> {item.shop || '—'} · <span className="font-bold">Status:</span> {item.cleaning_status}
          </div>
          <div className="flex gap-2">
            {(before > 0 || after > 0) && (
              <button
                onClick={onViewPhotos}
                className="flex-1 py-3 rounded-xl bg-cyan-500/20 text-cyan-300 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95"
              >
                <ImageIcon size={14} /> VIEW PHOTOS ({before + after})
              </button>
            )}
            <button
              onClick={() => onClearFlag(item.id)}
              disabled={isClearing}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {isClearing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              CLEAR FLAG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotosModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  if (!item) return null;
  const before = (item.before_cleaning_photos || []).filter(Boolean);
  const after = (item.after_cleaning_photos || []).filter(Boolean);
  const LABELS = ['Inside', 'Outside', 'Front', 'Back'];

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <p className="font-heading text-lg text-white">
          {canonicalProductType(item.product_type)} · {item.barcode}
        </p>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <X size={20} className="text-white" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-2">Before cleaning</p>
          <div className="grid grid-cols-2 gap-2">
            {LABELS.map((label, i) => (
              <div key={label} className="space-y-1">
                <p className="text-[10px] text-gray-500 font-bold">{label.toUpperCase()}</p>
                {before[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={before[i]} alt={label} className="w-full aspect-square object-cover rounded-lg" />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-[#1a1a1a] border border-dashed border-gray-700 flex items-center justify-center">
                    <span className="text-xs text-gray-600">missing</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">After cleaning</p>
          <div className="grid grid-cols-2 gap-2">
            {LABELS.map((label, i) => (
              <div key={label} className="space-y-1">
                <p className="text-[10px] text-gray-500 font-bold">{label.toUpperCase()}</p>
                {after[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={after[i]} alt={label} className="w-full aspect-square object-cover rounded-lg" />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-[#1a1a1a] border border-dashed border-gray-700 flex items-center justify-center">
                    <span className="text-xs text-gray-600">missing</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
