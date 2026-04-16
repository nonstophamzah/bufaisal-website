'use client';

import { useState, useCallback } from 'react';
import { WebsiteConfig } from '@/lib/supabase';
import * as adminApi from '@/lib/admin-api';

export function useAdminSettings(onToast: (type: 'ok' | 'err', msg: string) => void) {
  const [configs, setConfigs] = useState<WebsiteConfig[]>([]);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const data = await adminApi.getConfig();
    setConfigs(data || []);
    const draft: Record<string, string> = {};
    (data || []).forEach((c) => {
      draft[c.config_key] = c.config_value;
    });
    setConfigDraft(draft);
    setLoading(false);
  }, []);

  const saveSettings = useCallback(async () => {
    setSavingConfig(true);
    try {
      for (const cfg of configs) {
        const newVal = configDraft[cfg.config_key];
        if (newVal !== cfg.config_value) {
          await adminApi.updateConfig(cfg.config_key, newVal);
        }
      }
      await fetchSettings();
      onToast('ok', 'Settings saved');
    } catch (err) {
      onToast('err', 'Failed to save settings');
    }
    setSavingConfig(false);
  }, [configs, configDraft, fetchSettings, onToast]);

  return {
    configs,
    configDraft,
    setConfigDraft,
    savingConfig,
    loading,
    fetchSettings,
    saveSettings,
  };
}
