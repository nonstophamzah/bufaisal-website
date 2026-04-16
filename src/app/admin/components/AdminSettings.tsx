'use client';

import { Save, Loader2 } from 'lucide-react';
import { Section, Field, FieldTextarea, Spinner } from './shared';

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'];

export function AdminSettings({
  loading,
  configDraft,
  setConfigDraft,
  savingConfig,
  onSaveSettings,
}: {
  loading: boolean;
  configDraft: Record<string, string>;
  setConfigDraft: (draft: Record<string, string>) => void;
  savingConfig: boolean;
  onSaveSettings: () => Promise<void>;
}) {
  if (loading) return <Spinner />;

  return (
    <div className="space-y-8 max-w-2xl">
      <Section title="HERO SECTION">
        <Field
          label="Hero Title"
          value={configDraft['hero_title'] || ''}
          onChange={(v) =>
            setConfigDraft({ ...configDraft, hero_title: v })
          }
        />
        <Field
          label="Hero Subtitle"
          value={configDraft['hero_subtitle'] || ''}
          onChange={(v) =>
            setConfigDraft({ ...configDraft, hero_subtitle: v })
          }
        />
      </Section>

      <Section title="CONTACT">
        <Field
          label="WhatsApp Number"
          value={configDraft['whatsapp_number'] || ''}
          onChange={(v) =>
            setConfigDraft({ ...configDraft, whatsapp_number: v })
          }
          hint="Include country code, e.g. 971585932499"
        />
      </Section>

      <Section title="ABOUT US">
        <FieldTextarea
          label="About Text"
          value={configDraft['about_text'] || ''}
          onChange={(v) =>
            setConfigDraft({ ...configDraft, about_text: v })
          }
        />
      </Section>

      <Section title="SHOP NAMES">
        {SHOP_LABELS.map((l: string) => {
          const key = `shop_${l.toLowerCase()}_name`;
          return (
            <Field
              key={key}
              label={`Shop ${l} Display Name`}
              value={configDraft[key] || ''}
              onChange={(v) =>
                setConfigDraft({ ...configDraft, [key]: v })
              }
            />
          );
        })}
      </Section>

      <button
        onClick={onSaveSettings}
        disabled={savingConfig}
        className="flex items-center gap-2 bg-yellow text-black font-semibold px-6 py-3 rounded-xl hover:bg-yellow/90 disabled:opacity-50"
      >
        {savingConfig ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Save size={18} />
        )}
        Save Settings
      </button>
    </div>
  );
}
