'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LogOut,
  Eye,
  EyeOff,
  Clock,
  Star,
  BarChart3,
  Settings,
  Users,
  ShoppingBag,
  Package,
} from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { useAdminAuth } from './hooks/useAdminAuth';
import { useAdminItems } from './hooks/useAdminItems';
import { useAdminSettings } from './hooks/useAdminSettings';
import { useAdminTeam } from './hooks/useAdminTeam';
import { AdminLogin } from './components/AdminLogin';
import { AdminItems } from './components/AdminItems';
import { AdminSettings } from './components/AdminSettings';
import { AdminTeam } from './components/AdminTeam';
import { AdminAnalytics, AnalyticsData } from './components/AdminAnalytics';

type Tab =
  | 'pending'
  | 'published'
  | 'sold'
  | 'hidden'
  | 'settings'
  | 'team'
  | 'analytics';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [allItems, setAllItems] = useState<ShopItem[]>([]);

  // Auth hook
  const { pin, setPin, user, loginError, loginLoading, handleLogin, logout } =
    useAdminAuth();

  // Toast helper
  const showToast = useCallback((type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Items hook
  const itemsHook = useAdminItems(
    tab as 'pending' | 'published' | 'sold' | 'hidden',
    showToast
  );

  // Settings hook
  const settingsHook = useAdminSettings(showToast);

  // Team hook
  const teamHook = useAdminTeam(user, showToast);

  // ─── Route tab changes ──────────────────────
  useEffect(() => {
    if (!user) return;
    if (tab === 'settings') settingsHook.fetchSettings();
    else if (tab === 'team') teamHook.fetchTeam();
    else if (tab === 'analytics') fetchAnalytics();
    else itemsHook.fetchItems();
  }, [user, tab]);

  const fetchAnalytics = useCallback(async () => {
    itemsHook.fetchItems().then(() => {
      // Fetch all items for analytics
      const fetchAllItems = async () => {
        const res = await fetch('/api/admin/items?limit=10000');
        if (res.ok) {
          const data = await res.json();
          setAllItems(data || []);
        }
      };
      fetchAllItems();
    });
  }, [itemsHook]);

  // ─── Analytics data ────────────────────────
  const analytics: AnalyticsData = (() => {
    if (tab !== 'analytics' || allItems.length === 0)
      return {
        total: 0,
        pending: 0,
        published: 0,
        sold: 0,
        hidden: 0,
        clicks: 0,
        views: 0,
        topClicks: [] as ShopItem[],
        topViews: [] as ShopItem[],
        byShop: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
      };

    const pending = allItems.filter(
      (i) => !i.is_published && !i.is_sold && !i.is_hidden
    );
    const published = allItems.filter(
      (i) => i.is_published && !i.is_sold && !i.is_hidden
    );
    const sold = allItems.filter((i) => i.is_sold);
    const hidden = allItems.filter((i) => i.is_hidden);

    const byShop: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    allItems.forEach((i) => {
      const shop = i.shop_source || i.shop_label || 'Unknown';
      byShop[shop] = (byShop[shop] || 0) + 1;
      byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    });

    return {
      total: allItems.length,
      pending: pending.length,
      published: published.length,
      sold: sold.length,
      hidden: hidden.length,
      clicks: allItems.reduce((s, i) => s + (i.whatsapp_clicks || 0), 0),
      views: allItems.reduce((s, i) => s + (i.view_count || 0), 0),
      topClicks: [...allItems]
        .sort((a, b) => (b.whatsapp_clicks || 0) - (a.whatsapp_clicks || 0))
        .slice(0, 5),
      topViews: [...allItems]
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
        .slice(0, 5),
      byShop,
      byCategory,
    };
  })();

  // ─── PIN login ─────────────────────────────
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

  // ─── Tab config ────────────────────────────
  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'pending', label: 'Pending', icon: Clock },
    { key: 'published', label: 'Live', icon: Eye },
    { key: 'sold', label: 'Sold', icon: ShoppingBag },
    { key: 'hidden', label: 'Hidden', icon: EyeOff },
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="pt-20 pb-16">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
            toast.type === 'ok'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-heading text-3xl">
              ADMIN <span className="text-yellow">DASHBOARD</span>
            </h1>
            <p className="text-muted text-sm">Logged in as {user}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-sm text-muted hover:text-black transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto hide-scrollbar pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? 'bg-yellow text-black'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {(tab === 'pending' ||
          tab === 'published' ||
          tab === 'sold' ||
          tab === 'hidden') && (
          <AdminItems
            tab={tab}
            items={itemsHook.items}
            loading={itemsHook.loading}
            editingId={itemsHook.editingId}
            editForm={itemsHook.editForm}
            setEditForm={itemsHook.setEditForm}
            selected={itemsHook.selected}
            onApprove={itemsHook.approve}
            onReject={itemsHook.reject}
            onMarkSold={itemsHook.markSold}
            onUnsell={itemsHook.unsell}
            onHide={itemsHook.hide}
            onUnhide={itemsHook.unhide}
            onDeletePermanently={itemsHook.deletePermanently}
            onToggleFeatured={itemsHook.toggleFeatured}
            onStartEdit={itemsHook.startEdit}
            onSaveEdit={itemsHook.saveEdit}
            onCancelEdit={itemsHook.cancelEdit}
            onToggleSelect={itemsHook.toggleSelect}
            onToggleSelectAll={itemsHook.toggleSelectAll}
            onBulkApprove={itemsHook.bulkApprove}
            onBulkDelete={itemsHook.bulkDelete}
            showToast={showToast}
          />
        )}

        {tab === 'settings' && (
          <AdminSettings
            loading={settingsHook.loading}
            configDraft={settingsHook.configDraft}
            setConfigDraft={settingsHook.setConfigDraft}
            savingConfig={settingsHook.savingConfig}
            onSaveSettings={settingsHook.saveSettings}
          />
        )}

        {tab === 'team' && (
          <AdminTeam
            loading={teamHook.loading}
            managers={teamHook.managers}
            passwords={teamHook.passwords}
            newManager={teamHook.newManager}
            setNewManager={teamHook.setNewManager}
            passwordDraft={teamHook.passwordDraft}
            setPasswordDraft={teamHook.setPasswordDraft}
            savingTeam={teamHook.savingTeam}
            onAddManager={teamHook.addManager}
            onToggleManagerActive={teamHook.toggleManagerActive}
            onDeleteManager={teamHook.deleteManager}
            onSavePasswords={teamHook.savePasswords}
          />
        )}

        {tab === 'analytics' && (
          <AdminAnalytics
            loading={itemsHook.loading}
            analytics={analytics}
            allItems={allItems}
          />
        )}
      </div>
    </div>
  );
}
