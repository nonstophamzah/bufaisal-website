'use client';

import { useState, useCallback } from 'react';
import { DutyManager, ShopPassword } from '@/lib/supabase';

export function useAdminTeam(
  user: string,
  onToast: (type: 'ok' | 'err', msg: string) => void
) {
  const [managers, setManagers] = useState<DutyManager[]>([]);
  const [passwords, setPasswords] = useState<ShopPassword[]>([]);
  const [newManager, setNewManager] = useState({ name: '', shop_label: 'A' });
  const [passwordDraft, setPasswordDraft] = useState<Record<string, string>>({});
  const [savingTeam, setSavingTeam] = useState(false);
  const [loading, setLoading] = useState(false);

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-name': user,
  }), [user]);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team', { headers: adminHeaders() });
      const data = await res.json();
      setManagers(data.managers || []);
      setPasswords(data.passwords || []);
      const pd: Record<string, string> = {};
      (data.passwords || []).forEach((p: { shop_label: string }) => {
        pd[p.shop_label] = '';
      });
      setPasswordDraft(pd);
    } catch {
      onToast('err', 'Failed to load team data');
    }
    setLoading(false);
  }, [adminHeaders, onToast]);

  const addManager = useCallback(async () => {
    if (!newManager.name.trim()) return;
    setSavingTeam(true);
    try {
      await fetch('/api/admin/team', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          action: 'add_manager',
          name: newManager.name.trim(),
          shop_label: newManager.shop_label,
        }),
      });
      setNewManager({ name: '', shop_label: 'A' });
      await fetchTeam();
      onToast('ok', 'Manager added');
    } catch {
      onToast('err', 'Failed to add manager');
    }
    setSavingTeam(false);
  }, [newManager, fetchTeam, adminHeaders, onToast]);

  const toggleManagerActive = useCallback(
    async (id: string, current: boolean) => {
      try {
        await fetch('/api/admin/team', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({
            action: 'toggle_manager',
            id,
            is_active: !current,
          }),
        });
        await fetchTeam();
      } catch {
        onToast('err', 'Failed to update manager');
      }
    },
    [fetchTeam, adminHeaders, onToast]
  );

  const deleteManager = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Remove ${name}?`)) return;
      try {
        await fetch('/api/admin/team', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ action: 'delete_manager', id }),
        });
        await fetchTeam();
        onToast('ok', 'Manager removed');
      } catch {
        onToast('err', 'Failed to remove manager');
      }
    },
    [fetchTeam, adminHeaders, onToast]
  );

  const savePasswords = useCallback(async () => {
    setSavingTeam(true);
    try {
      for (const pw of passwords) {
        const newVal = passwordDraft[pw.shop_label];
        if (newVal) {
          await fetch('/api/admin/team', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify({
              action: 'update_password',
              shop_label: pw.shop_label,
              new_password: newVal,
            }),
          });
        }
      }
      await fetchTeam();
      onToast('ok', 'Passwords updated');
    } catch {
      onToast('err', 'Failed to update passwords');
    }
    setSavingTeam(false);
  }, [passwords, passwordDraft, fetchTeam, adminHeaders, onToast]);

  return {
    managers,
    passwords,
    newManager,
    setNewManager,
    passwordDraft,
    setPasswordDraft,
    savingTeam,
    loading,
    fetchTeam,
    addManager,
    toggleManagerActive,
    deleteManager,
    savePasswords,
  };
}
