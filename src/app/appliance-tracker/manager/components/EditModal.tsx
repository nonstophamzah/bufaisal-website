'use client';

import { Loader2, Save, X } from 'lucide-react';
import SearchableSelect from '../../components/SearchableSelect';
import {
  PRODUCT_TYPES,
  BRANDS,
  PRODUCT_OTHER,
  BRAND_OTHER,
} from '@/lib/appliance-catalog';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  condition: string | null;
  shop: string | null;
}

interface EditFormData {
  product_type: string;
  brand: string;
  status: string;
  problems: string[];
  shop: string;
  barcode: string;
}

const ITEM_STATUSES = ['Working', 'Not Working', 'Scrap'];
const PROBLEMS_LIST = ['No power', 'Not cooling', 'Leaking', 'Part missing', 'Other'];

export function EditModal({
  item,
  editForm,
  onFormChange,
  onToggleProblem,
  onSave,
  isSaving,
  onClose,
}: {
  item: Item | null;
  editForm: EditFormData;
  onFormChange: (updates: Partial<EditFormData>) => void;
  onToggleProblem: (problem: string) => void;
  onSave: () => void;
  isSaving: boolean;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-0 sm:px-6">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-2xl">EDIT ITEM</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <X size={24} />
          </button>
        </div>
        <p className="font-bold text-sm mb-2">SHOP</p>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {['A', 'B', 'C', 'D', 'E'].map((s) => (
            <button
              key={s}
              onClick={() => onFormChange({ shop: s })}
              className={`py-3 rounded-xl font-heading text-xl active:scale-95 ${
                editForm.shop === s ? 'bg-black text-yellow' : 'bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="font-bold text-sm mb-2">PRODUCT</p>
        <div className="mb-4">
          <SearchableSelect
            value={editForm.product_type}
            onChange={(v) => onFormChange({ product_type: v })}
            options={PRODUCT_TYPES}
            placeholder="Search product type..."
            otherLabel={PRODUCT_OTHER}
          />
        </div>
        <p className="font-bold text-sm mb-2">BRAND</p>
        <div className="mb-4">
          <SearchableSelect
            value={editForm.brand}
            onChange={(v) => onFormChange({ brand: v })}
            options={BRANDS}
            placeholder="Search brand..."
            otherLabel={BRAND_OTHER}
          />
        </div>
        <p className="font-bold text-sm mb-2">STATUS</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {ITEM_STATUSES.map((s) => {
            const clr =
              s === 'Working'
                ? 'bg-green-500 text-white'
                : s === 'Not Working'
                  ? 'bg-orange-500 text-white'
                  : 'bg-red-500 text-white';
            return (
              <button
                key={s}
                onClick={() => onFormChange({ status: s })}
                className={`py-3 rounded-xl font-bold text-sm active:scale-95 ${
                  editForm.status === s ? `${clr} ring-2 ring-offset-1 ring-black` : 'bg-gray-200'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
        {editForm.status === 'Not Working' && (
          <>
            <p className="font-bold text-sm mb-2">PROBLEMS</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {PROBLEMS_LIST.map((p) => (
                <button
                  key={p}
                  onClick={() => onToggleProblem(p)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-bold active:scale-95 min-h-[44px] ${
                    editForm.problems.includes(p) ? 'bg-orange-500 text-white' : 'bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="font-bold text-sm mb-2">BARCODE</p>
        <input
          type="text"
          value={editForm.barcode}
          onChange={(e) => onFormChange({ barcode: e.target.value })}
          className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow mb-4"
        />
        <button
          onClick={onSave}
          disabled={isSaving}
          className="w-full py-4 rounded-2xl bg-yellow text-black font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />} SAVE
        </button>
      </div>
    </div>
  );
}
