'use client';

import { useState } from 'react';
import { Loader2, Save, Sparkles, Check, X } from 'lucide-react';
import Image from 'next/image';
import { ShopItem } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';

const CONDITIONS = ['Excellent', 'Good', 'Fair'];

const ADMIN_SESSION_KEY = 'admin_session';

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

export function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function Thumb({ item }: { item: ShopItem }) {
  const src = item.thumbnail_url || item.image_urls?.[0];
  return (
    <div className="relative w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
      {src && (
        <Image src={src} alt={item.item_name} fill className="object-cover" sizes="56px" />
      )}
    </div>
  );
}

export function ConditionBadge({ condition }: { condition: string | null }) {
  if (!condition) return null;
  const color =
    condition === 'Excellent'
      ? 'bg-green-100 text-green-700'
      : condition === 'Good'
        ? 'bg-yellow/20 text-yellow-700'
        : 'bg-orange-100 text-orange-700';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>
      {condition}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-20">
      <p className="font-heading text-2xl mb-1">NOTHING HERE</p>
      <p className="text-muted text-sm">{text}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 size={32} className="animate-spin text-yellow" />
    </div>
  );
}

// Sprint 3 / Fix 4: "Regenerate Title & Description with AI" button.
// Calls /api/admin/regenerate-listing with the current edit-form context, shows
// the suggested title + description, and lets the admin Apply or Reject before
// the values are written to the form. Apply only mutates title/description
// (and SEO twins) — it never overwrites brand/category/condition.
function RegenerateListing({
  itemId,
  editForm,
  onApply,
}: {
  itemId: string;
  editForm: Partial<ShopItem>;
  onApply: (title: string, description: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<{ title: string; description: string } | null>(null);

  const run = async () => {
    setLoading(true);
    setError('');
    setSuggestion(null);

    const token = getAdminToken();
    if (!token) {
      setError('Admin session expired. Refresh and sign back in.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/regenerate-listing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: itemId,
          context: {
            brand: editForm.brand,
            category: editForm.category,
            condition: editForm.condition,
            condition_notes: editForm.condition_notes,
            price: editForm.sale_price,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
      } else if (!data.title && !data.description) {
        setError('AI returned no usable title or description.');
      } else {
        setSuggestion({ title: data.title || '', description: data.description || '' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {loading ? 'Generating…' : 'Regenerate Title & Description with AI'}
        </button>
        <p className="text-[11px] text-muted hidden sm:block">
          Reads photos + edited brand/category/condition. Suggestion shown below for review.
        </p>
      </div>

      {error && (
        <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
      )}

      {suggestion && (
        <div className="mt-3 border border-yellow rounded-lg p-3 bg-yellow/5 space-y-2">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">
              Suggested title
            </p>
            <p className="text-sm font-semibold">{suggestion.title || <span className="text-muted italic">(none)</span>}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">
              Suggested description
            </p>
            <p className="text-sm leading-relaxed">{suggestion.description || <span className="text-muted italic">(none)</span>}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onApply(suggestion.title, suggestion.description);
                setSuggestion(null);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
            >
              <Check size={14} /> Apply
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300"
            >
              <X size={14} /> Reject
            </button>
          </div>
          <p className="text-[10px] text-muted">
            Apply writes the suggestion into the form. You still need to tap <span className="font-semibold">Save</span> to persist it.
          </p>
        </div>
      )}
    </div>
  );
}

export function EditPanel({
  itemId,
  editForm,
  setEditForm,
  onSave,
  onCancel,
  showPrice,
}: {
  itemId?: string;
  editForm: Partial<ShopItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<ShopItem>>>;
  onSave: () => void;
  onCancel: () => void;
  showPrice?: boolean;
}) {
  const set = (key: string, value: string | number | boolean) =>
    setEditForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="bg-gray-50 border border-gray-200 border-t-0 rounded-b-xl p-4 space-y-3">
      {itemId && (
        <RegenerateListing
          itemId={itemId}
          editForm={editForm}
          onApply={(title, description) =>
            setEditForm((f) => ({
              ...f,
              item_name: title || f.item_name,
              description: description || f.description,
              seo_title: title || f.seo_title,
              seo_description: description || f.seo_description,
            }))
          }
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Item Name"
          value={(editForm.item_name as string) || ''}
          onChange={(v) => set('item_name', v)}
        />
        <Field
          label="Brand"
          value={(editForm.brand as string) || ''}
          onChange={(v) => set('brand', v)}
        />
        {showPrice && (
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Price (AED)
            </label>
            <input
              type="number"
              step="0.01"
              value={editForm.sale_price ?? ''}
              onChange={(e) => set('sale_price', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            Category
          </label>
          <select
            value={(editForm.category as string) || ''}
            onChange={(e) => set('category', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            Condition
          </label>
          <select
            value={(editForm.condition as string) || 'Good'}
            onChange={(e) => set('condition', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow bg-white"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Barcode"
          value={(editForm.barcode as string) || ''}
          onChange={(v) => set('barcode', v)}
        />
        <Field
          label="Product Type"
          value={(editForm.product_type as string) || ''}
          onChange={(v) => set('product_type', v)}
        />
        <Field
          label="SEO Title"
          value={(editForm.seo_title as string) || ''}
          onChange={(v) => set('seo_title', v)}
        />
        <div className="sm:col-span-2">
          <FieldTextarea
            label="SEO Description"
            value={(editForm.seo_description as string) || ''}
            onChange={(v) => set('seo_description', v)}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldTextarea
            label="Description"
            value={(editForm.description as string) || ''}
            onChange={(v) => set('description', v)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer sm:col-span-2">
          <input
            type="checkbox"
            checked={!!editForm.is_featured}
            onChange={(e) => set('is_featured', e.target.checked)}
            className="w-4 h-4 accent-yellow"
          />
          Featured (pinned to top)
        </label>
        {/* PR #12: negotiable toggle. Default true on legacy items. */}
        <label className="flex items-start gap-2 text-sm font-medium cursor-pointer sm:col-span-2">
          <input
            type="checkbox"
            checked={editForm.negotiable !== false}
            onChange={(e) => set('negotiable', e.target.checked)}
            className="w-4 h-4 accent-yellow mt-0.5"
          />
          <span>
            <span className="block">Price is negotiable</span>
            <span className="block text-[11px] text-muted font-normal">
              Off = customer sees a grey &quot;Starting Price&quot; pill instead of yellow &quot;Negotiable&quot;.
            </span>
          </span>
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          className="flex items-center gap-1 px-4 py-2 bg-yellow text-black text-sm font-semibold rounded-lg hover:bg-yellow/90"
        >
          <Save size={15} /> Save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-heading text-xl mb-3">
        {title.split(' ').map((w, i) =>
          i === title.split(' ').length - 1 ? (
            <span key={i} className="text-yellow">
              {w}
            </span>
          ) : (
            <span key={i}>{w} </span>
          )
        )}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow"
      />
      {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

export function FieldTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow resize-none"
      />
    </div>
  );
}

export function RankList({
  title,
  items,
  metric,
}: {
  title: string;
  items: ShopItem[];
  metric: (i: ShopItem) => string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <h3 className="font-heading text-lg mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No data</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3">
              <span className="font-heading text-lg text-yellow w-6 text-center">
                {idx + 1}
              </span>
              <div className="relative w-8 h-8 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                {(item.thumbnail_url || item.image_urls?.[0]) && (
                  <Image
                    src={item.thumbnail_url || item.image_urls[0]}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                )}
              </div>
              <span className="flex-1 text-sm truncate">{item.item_name}</span>
              <span className="text-xs font-semibold text-muted">
                {metric(item)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Breakdown({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? entries[0][1] : 1;

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <h3 className="font-heading text-lg mb-3">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No data</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([label, count]) => (
            <div key={label}>
              <div className="flex justify-between text-sm mb-0.5">
                <span>{label}</span>
                <span className="font-semibold">{count}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow rounded-full"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
