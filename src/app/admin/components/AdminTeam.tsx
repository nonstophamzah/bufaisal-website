'use client';

import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { DutyManager, ShopPassword } from '@/lib/supabase';
import { Section, Spinner } from './shared';

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'];

export function AdminTeam({
  loading,
  managers,
  passwords,
  newManager,
  setNewManager,
  passwordDraft,
  setPasswordDraft,
  savingTeam,
  onAddManager,
  onToggleManagerActive,
  onDeleteManager,
  onSavePasswords,
}: {
  loading: boolean;
  managers: DutyManager[];
  passwords: ShopPassword[];
  newManager: { name: string; shop_label: string };
  setNewManager: (m: { name: string; shop_label: string }) => void;
  passwordDraft: Record<string, string>;
  setPasswordDraft: (draft: Record<string, string>) => void;
  savingTeam: boolean;
  onAddManager: () => Promise<void>;
  onToggleManagerActive: (id: string, current: boolean) => Promise<void>;
  onDeleteManager: (id: string, name: string) => Promise<void>;
  onSavePasswords: () => Promise<void>;
}) {
  if (loading) return <Spinner />;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Add manager */}
      <Section title="ADD DUTY MANAGER">
        <div className="flex gap-2">
          <input
            type="text"
            value={newManager.name}
            onChange={(e) =>
              setNewManager({ ...newManager, name: e.target.value })
            }
            placeholder="Manager name"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow"
          />
          <select
            value={newManager.shop_label}
            onChange={(e) =>
              setNewManager({ ...newManager, shop_label: e.target.value })
            }
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow bg-white"
          >
            {SHOP_LABELS.map((l: string) => (
              <option key={l} value={l}>
                Shop {l}
              </option>
            ))}
          </select>
          <button
            onClick={onAddManager}
            disabled={savingTeam || !newManager.name.trim()}
            className="flex items-center gap-1 px-4 py-2.5 bg-yellow text-black text-sm font-semibold rounded-lg hover:bg-yellow/90 disabled:opacity-50"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </Section>

      {/* Managers grouped by shop */}
      <Section title="DUTY MANAGERS">
        {SHOP_LABELS.map((label: string) => {
          const shopMgrs = managers.filter((m) => m.shop_label === label);
          if (shopMgrs.length === 0) return null;
          return (
            <div key={label} className="mb-4">
              <p className="text-xs font-bold text-muted uppercase mb-2">
                Shop {label}
              </p>
              <div className="space-y-1.5">
                {shopMgrs.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-lg"
                  >
                    <span
                      className={`flex-1 text-sm font-medium ${
                        !m.is_active ? 'line-through text-muted' : ''
                      }`}
                    >
                      {m.name}
                    </span>
                    <button
                      onClick={() => onToggleManagerActive(m.id, m.is_active)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                        m.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {m.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => onDeleteManager(m.id, m.name)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {managers.length === 0 && (
          <p className="text-sm text-muted">No managers added yet.</p>
        )}
      </Section>

      {/* Shop passwords */}
      <Section title="SHOP PASSWORDS">
        <p className="text-xs text-muted mb-3">
          Passwords are hashed. Enter a new value to change.
        </p>
        <div className="space-y-3">
          {SHOP_LABELS.map((label: string) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-sm font-bold w-16">Shop {label}</span>
              <input
                type="password"
                value={passwordDraft[label] || ''}
                onChange={(e) =>
                  setPasswordDraft({
                    ...passwordDraft,
                    [label]: e.target.value,
                  })
                }
                placeholder="Enter new password"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow"
              />
            </div>
          ))}
        </div>
        <button
          onClick={onSavePasswords}
          disabled={savingTeam}
          className="flex items-center gap-2 mt-4 bg-yellow text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-yellow/90 disabled:opacity-50 text-sm"
        >
          {savingTeam ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Save Passwords
        </button>
      </Section>
    </div>
  );
}
