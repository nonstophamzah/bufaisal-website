'use client';

import { Loader2, Save } from 'lucide-react';
import Image from 'next/image';
import { ShopItem } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';

const CONDITIONS = ['Excellent', 'Good', 'Fair'];

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

export function EditPanel({
  editForm,
  setEditForm,
  onSave,
  onCancel,
  showPrice,
}: {
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
