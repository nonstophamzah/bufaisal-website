'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  X,
  Loader2,
  LogOut,
  Eye,
  EyeOff,
  MousePointerClick,
  DollarSign,
  Package,
  Clock,
  Star,
  Pencil,
  Trash2,
  Undo2,
  Save,
  Plus,
  BarChart3,
  Settings,
  Users,
  ShoppingBag,
} from 'lucide-react';
import Image from 'next/image';
import {
  supabase,
  ShopItem,
  WebsiteConfig,
  DutyManager,
  ShopPassword,
} from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'];
const CONDITIONS = ['Excellent', 'Good', 'Fair'];

type Tab =
  | 'pending'
  | 'published'
  | 'sold'
  | 'hidden'
  | 'settings'
  | 'team'
  | 'analytics';

// ─── Helpers ───────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Thumb({ item }: { item: ShopItem }) {
  const src = item.thumbnail_url || item.image_urls?.[0];
  return (
    <div className="relative w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
      {src && (
        <Image src={src} alt={item.item_name} fill className="object-cover" sizes="56px" />
      )}
    </div>
  );
}

function ConditionBadge({ condition }: { condition: string | null }) {
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-20">
      <p className="font-heading text-2xl mb-1">NOTHING HERE</p>
      <p className="text-muted text-sm">{text}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 size={32} className="animate-spin text-yellow" />
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState('');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ShopItem>>({});

  // bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // settings
  const [configs, setConfigs] = useState<WebsiteConfig[]>([]);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  // team
  const [managers, setManagers] = useState<DutyManager[]>([]);
  const [passwords, setPasswords] = useState<ShopPassword[]>([]);
  const [newManager, setNewManager] = useState({ name: '', shop_label: 'A' });
  const [passwordDraft, setPasswordDraft] = useState<Record<string, string>>({});
  const [savingTeam, setSavingTeam] = useState(false);

  // analytics
  const [allItems, setAllItems] = useState<ShopItem[]>([]);

  const [loginLoading, setLoginLoading] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Session expiry — auto-logout after 30 min inactive
  useEffect(() => {
    if (!user) return;
    const check = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT) {
        setUser('');
        setPin('');
      }
    }, 30_000);
    const resetTimer = () => setLastActivity(Date.now());
    window.addEventListener('click', resetTimer);
    window.addEventListener('keydown', resetTimer);
    return () => {
      clearInterval(check);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [user, lastActivity]);

  // ─── Login (server-side PIN validation) ────────────────

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok && data.name) {
        setUser(data.name);
        setLastActivity(Date.now());
      } else {
        setLoginError(data.error || 'Invalid PIN');
      }
    } catch {
      setLoginError('Connection error. Try again.');
    }
    setLoginLoading(false);
  };

  // ─── Fetch items for current tab ──────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    setEditingId(null);
    let query = supabase.from('shop_items').select('*');

    if (tab === 'pending') {
      query = query
        .eq('is_published', false)
        .eq('is_sold', false)
        .eq('is_hidden', false);
    } else if (tab === 'published') {
      query = query
        .eq('is_published', true)
        .eq('is_sold', false)
        .eq('is_hidden', false);
    } else if (tab === 'sold') {
      query = query.eq('is_sold', true);
    } else if (tab === 'hidden') {
      query = query.eq('is_hidden', true);
    }

    if (tab === 'published') {
      query = query
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data } = await query;
    setItems(data || []);
    setLoading(false);
  }, [tab]);

  // ─── Fetch settings ───────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('website_config')
      .select('*')
      .order('config_key');
    setConfigs(data || []);
    const draft: Record<string, string> = {};
    (data || []).forEach((c) => {
      draft[c.config_key] = c.config_value;
    });
    setConfigDraft(draft);
    setLoading(false);
  }, []);

  // ─── Fetch team ────────────────────────────────────────

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    const [{ data: mgrs }, { data: pwds }] = await Promise.all([
      supabase.from('duty_managers').select('*').order('shop_label').order('name'),
      supabase.from('shop_passwords').select('*').order('shop_label'),
    ]);
    setManagers(mgrs || []);
    setPasswords(pwds || []);
    const pd: Record<string, string> = {};
    (pwds || []).forEach((p) => {
      pd[p.shop_label] = p.password;
    });
    setPasswordDraft(pd);
    setLoading(false);
  }, []);

  // ─── Fetch analytics ──────────────────────────────────

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('shop_items').select('*');
    setAllItems(data || []);
    setLoading(false);
  }, []);

  // ─── Route tab changes ────────────────────────────────

  useEffect(() => {
    if (!user) return;
    if (tab === 'settings') fetchSettings();
    else if (tab === 'team') fetchTeam();
    else if (tab === 'analytics') fetchAnalytics();
    else fetchItems();
  }, [user, tab, fetchItems, fetchSettings, fetchTeam, fetchAnalytics]);

  // ─── Item actions ──────────────────────────────────────

  const approve = async (id: string) => {
    const { error } = await supabase
      .from('shop_items')
      .update({ is_published: true, approved_by: user, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Item approved'); fetchItems(); }
  };

  const reject = async (id: string) => {
    if (!confirm('Delete this item permanently?')) return;
    const { error } = await supabase.from('shop_items').delete().eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Item deleted'); fetchItems(); }
  };

  const markSold = async (id: string) => {
    const { error } = await supabase.from('shop_items').update({ is_sold: true }).eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Marked as sold'); fetchItems(); }
  };

  const unsell = async (id: string) => {
    const { error } = await supabase.from('shop_items').update({ is_sold: false, is_published: true }).eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Item restored to live'); fetchItems(); }
  };

  const hide = async (id: string) => {
    const { error } = await supabase.from('shop_items').update({ is_hidden: true, is_published: false }).eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Item hidden'); fetchItems(); }
  };

  const unhide = async (id: string) => {
    const { error } = await supabase.from('shop_items').update({ is_hidden: false }).eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Item unhidden'); fetchItems(); }
  };

  const deletePermanently = async (id: string) => {
    if (!confirm('Delete permanently? This cannot be undone.')) return;
    const { error } = await supabase.from('shop_items').delete().eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', 'Item deleted permanently'); fetchItems(); }
  };

  const toggleFeatured = async (id: string, current: boolean) => {
    const { error } = await supabase.from('shop_items').update({ is_featured: !current }).eq('id', id);
    if (error) showToast('err', error.message);
    else { showToast('ok', current ? 'Unfeatured' : 'Featured'); fetchItems(); }
  };

  // ─── Inline edit ───────────────────────────────────────

  const startEdit = (item: ShopItem) => {
    setEditingId(item.id);
    setEditForm({
      item_name: item.item_name,
      brand: item.brand || '',
      category: item.category,
      condition: item.condition || 'Good',
      description: item.description || '',
      sale_price: item.sale_price,
      barcode: item.barcode || '',
      product_type: item.product_type || '',
      seo_title: item.seo_title || '',
      seo_description: item.seo_description || '',
      is_featured: item.is_featured,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editForm.item_name || !(editForm.item_name as string).trim()) {
      showToast('err', 'Item name is required');
      return;
    }
    const { error } = await supabase
      .from('shop_items')
      .update({
        item_name: (editForm.item_name as string).trim(),
        brand: editForm.brand || null,
        category: editForm.category,
        condition: editForm.condition,
        description: editForm.description || null,
        sale_price: Number(editForm.sale_price) || 0,
        barcode: editForm.barcode || null,
        product_type: editForm.product_type || null,
        seo_title: editForm.seo_title || null,
        seo_description: editForm.seo_description || null,
        is_featured: editForm.is_featured ?? false,
      })
      .eq('id', editingId);
    if (error) {
      showToast('err', error.message);
    } else {
      showToast('ok', 'Item updated');
      setEditingId(null);
      fetchItems();
    }
  };

  // ─── Bulk actions ──────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    const { error } = await supabase
      .from('shop_items')
      .update({
        is_published: true,
        approved_by: user,
        approved_at: new Date().toISOString(),
      })
      .in('id', Array.from(selected));
    if (error) showToast('err', error.message);
    else { showToast('ok', `${selected.size} items approved`); fetchItems(); }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} items permanently?`)) return;
    const { error } = await supabase.from('shop_items').delete().in('id', Array.from(selected));
    if (error) showToast('err', error.message);
    else { showToast('ok', `${selected.size} items deleted`); fetchItems(); }
  };

  // ─── Settings save ────────────────────────────────────

  const saveSettings = async () => {
    setSavingConfig(true);
    for (const cfg of configs) {
      const newVal = configDraft[cfg.config_key];
      if (newVal !== cfg.config_value) {
        await supabase
          .from('website_config')
          .update({ config_value: newVal, updated_by: user })
          .eq('config_key', cfg.config_key);
      }
    }
    await fetchSettings();
    setSavingConfig(false);
  };

  // ─── Team actions ──────────────────────────────────────

  const addManager = async () => {
    if (!newManager.name.trim()) return;
    setSavingTeam(true);
    await supabase.from('duty_managers').insert({
      name: newManager.name.trim(),
      shop_label: newManager.shop_label,
      is_active: true,
    });
    setNewManager({ name: '', shop_label: 'A' });
    await fetchTeam();
    setSavingTeam(false);
  };

  const toggleManagerActive = async (id: string, current: boolean) => {
    await supabase
      .from('duty_managers')
      .update({ is_active: !current })
      .eq('id', id);
    fetchTeam();
  };

  const deleteManager = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    await supabase.from('duty_managers').delete().eq('id', id);
    fetchTeam();
  };

  const savePasswords = async () => {
    setSavingTeam(true);
    for (const pw of passwords) {
      const newVal = passwordDraft[pw.shop_label];
      if (newVal !== pw.password) {
        await supabase
          .from('shop_passwords')
          .update({ password: newVal })
          .eq('shop_label', pw.shop_label);
      }
    }
    await fetchTeam();
    setSavingTeam(false);
  };

  // ─── PIN login ─────────────────────────────────────────

  if (!user) {
    return (
      <div className="pt-20 pb-16 flex items-center justify-center min-h-screen">
        <div className="max-w-sm w-full mx-4">
          <h1 className="font-heading text-4xl text-center mb-2">
            ADMIN <span className="text-yellow">PANEL</span>
          </h1>
          <p className="text-muted text-center mb-8 text-sm">
            Enter admin PIN to continue
          </p>
          <div className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Enter PIN"
              className="w-full text-center text-2xl tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
            />
            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full bg-yellow text-black font-semibold py-3 rounded-xl hover:bg-yellow/90 transition-colors disabled:opacity-50"
            >
              {loginLoading ? 'Checking...' : 'Login'}
            </button>
            {loginError && (
              <p className="text-red-500 text-sm text-center">{loginError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Tab config ────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'pending', label: 'Pending', icon: Clock },
    { key: 'published', label: 'Live', icon: Eye },
    { key: 'sold', label: 'Sold', icon: ShoppingBag },
    { key: 'hidden', label: 'Hidden', icon: EyeOff },
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  // ─── Analytics data ────────────────────────────────────

  const analytics = (() => {
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

  // ─── Render ────────────────────────────────────────────

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
            onClick={() => {
              setUser('');
              setPin('');
            }}
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

        {/* ─── TAB 1: PENDING ────────────────────────── */}
        {tab === 'pending' && (
          <>
            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState text="No pending items to review" />
            ) : (
              <>
                {/* Bulk bar */}
                <div className="flex items-center gap-3 mb-4 bg-gray-50 p-3 rounded-xl">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.size === items.length && items.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-yellow"
                    />
                    Select All ({selected.size}/{items.length})
                  </label>
                  {selected.size > 0 && (
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={bulkApprove}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
                      >
                        <Check size={14} /> Approve ({selected.size})
                      </button>
                      <button
                        onClick={bulkDelete}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
                      >
                        <Trash2 size={14} /> Delete ({selected.size})
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id}>
                      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 accent-yellow flex-shrink-0"
                        />
                        <Thumb item={item} />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate">
                            {item.item_name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted">{item.category}</span>
                            <ConditionBadge condition={item.condition} />
                          </div>
                          <p className="text-xs text-muted mt-0.5">
                            {item.shop_source || item.shop_label || '—'} &bull;{' '}
                            {item.duty_manager || item.uploaded_by || '—'} &bull;{' '}
                            {fmtDate(item.created_at)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => approve(item.id)}
                            className="w-9 h-9 bg-green-100 text-green-600 rounded-lg flex items-center justify-center hover:bg-green-200"
                            title="Approve"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => reject(item.id)}
                            className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200"
                            title="Reject / Delete"
                          >
                            <X size={18} />
                          </button>
                          <button
                            onClick={() =>
                              editingId === item.id
                                ? setEditingId(null)
                                : startEdit(item)
                            }
                            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                              editingId === item.id
                                ? 'bg-yellow text-black'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Inline edit */}
                      {editingId === item.id && (
                        <EditPanel
                          editForm={editForm}
                          setEditForm={setEditForm}
                          onSave={saveEdit}
                          onCancel={() => setEditingId(null)}
                          showPrice
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ─── TAB 2: PUBLISHED (LIVE) ──────────────── */}
        {tab === 'published' && (
          <>
            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState text="No published items" />
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id}>
                    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                      <Thumb item={item} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm truncate">
                            {item.item_name}
                          </h3>
                          {item.is_featured && (
                            <Star
                              size={14}
                              className="text-yellow fill-yellow flex-shrink-0"
                            />
                          )}
                        </div>
                        <p className="font-heading text-lg leading-tight">
                          AED {item.sale_price}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                          {(item.duty_manager || item.uploaded_by) && (
                            <span>by {item.duty_manager || item.uploaded_by}</span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <Eye size={12} /> {item.view_count}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <MousePointerClick size={12} /> {item.whatsapp_clicks}
                          </span>
                          <ConditionBadge condition={item.condition} />
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => toggleFeatured(item.id, item.is_featured)}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            item.is_featured
                              ? 'bg-yellow text-black'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          title={item.is_featured ? 'Unfeature' : 'Feature'}
                        >
                          <Star size={16} />
                        </button>
                        <button
                          onClick={() => markSold(item.id)}
                          className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
                          title="Mark Sold"
                        >
                          Sold
                        </button>
                        <button
                          onClick={() => hide(item.id)}
                          className="w-9 h-9 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200"
                          title="Hide"
                        >
                          <EyeOff size={16} />
                        </button>
                        <button
                          onClick={() =>
                            editingId === item.id
                              ? setEditingId(null)
                              : startEdit(item)
                          }
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            editingId === item.id
                              ? 'bg-yellow text-black'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </div>

                    {editingId === item.id && (
                      <EditPanel
                        editForm={editForm}
                        setEditForm={setEditForm}
                        onSave={saveEdit}
                        onCancel={() => setEditingId(null)}
                        showPrice
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── TAB 3: SOLD ───────────────────────────── */}
        {tab === 'sold' && (
          <>
            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState text="No sold items yet" />
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3"
                  >
                    <Thumb item={item} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {item.item_name}
                      </h3>
                      <p className="font-heading text-lg leading-tight">
                        AED {item.sale_price}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {item.duty_manager || item.uploaded_by ? `by ${item.duty_manager || item.uploaded_by} · ` : ''}
                        Sold &bull; {fmtDate(item.updated_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => unsell(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow text-black text-xs font-semibold rounded-lg hover:bg-yellow/90"
                      title="Put back live"
                    >
                      <Undo2 size={14} /> Unsell
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── TAB 4: HIDDEN ─────────────────────────── */}
        {tab === 'hidden' && (
          <>
            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState text="No hidden items" />
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3"
                  >
                    <Thumb item={item} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {item.item_name}
                      </h3>
                      <p className="text-xs text-muted">
                        {item.category} &bull; {item.shop_source || '—'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => unhide(item.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow text-black text-xs font-semibold rounded-lg hover:bg-yellow/90"
                      >
                        <Eye size={14} /> Unhide
                      </button>
                      <button
                        onClick={() => deletePermanently(item.id)}
                        className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200"
                        title="Delete permanently"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── TAB 5: WEBSITE SETTINGS ───────────────── */}
        {tab === 'settings' && (
          <>
            {loading ? (
              <Spinner />
            ) : (
              <div className="space-y-8 max-w-2xl">
                <Section title="HERO SECTION">
                  <Field
                    label="Hero Title"
                    value={configDraft['hero_title'] || ''}
                    onChange={(v) =>
                      setConfigDraft((d) => ({ ...d, hero_title: v }))
                    }
                  />
                  <Field
                    label="Hero Subtitle"
                    value={configDraft['hero_subtitle'] || ''}
                    onChange={(v) =>
                      setConfigDraft((d) => ({ ...d, hero_subtitle: v }))
                    }
                  />
                </Section>

                <Section title="CONTACT">
                  <Field
                    label="WhatsApp Number"
                    value={configDraft['whatsapp_number'] || ''}
                    onChange={(v) =>
                      setConfigDraft((d) => ({ ...d, whatsapp_number: v }))
                    }
                    hint="Include country code, e.g. 971585932499"
                  />
                </Section>

                <Section title="ABOUT US">
                  <FieldTextarea
                    label="About Text"
                    value={configDraft['about_text'] || ''}
                    onChange={(v) =>
                      setConfigDraft((d) => ({ ...d, about_text: v }))
                    }
                  />
                </Section>

                <Section title="SHOP NAMES">
                  {SHOP_LABELS.map((l) => {
                    const key = `shop_${l.toLowerCase()}_name`;
                    return (
                      <Field
                        key={key}
                        label={`Shop ${l} Display Name`}
                        value={configDraft[key] || ''}
                        onChange={(v) =>
                          setConfigDraft((d) => ({ ...d, [key]: v }))
                        }
                      />
                    );
                  })}
                </Section>

                <button
                  onClick={saveSettings}
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
            )}
          </>
        )}

        {/* ─── TAB 6: TEAM MANAGEMENT ────────────────── */}
        {tab === 'team' && (
          <>
            {loading ? (
              <Spinner />
            ) : (
              <div className="space-y-8 max-w-2xl">
                {/* Add manager */}
                <Section title="ADD DUTY MANAGER">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newManager.name}
                      onChange={(e) =>
                        setNewManager((n) => ({ ...n, name: e.target.value }))
                      }
                      placeholder="Manager name"
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow"
                    />
                    <select
                      value={newManager.shop_label}
                      onChange={(e) =>
                        setNewManager((n) => ({
                          ...n,
                          shop_label: e.target.value,
                        }))
                      }
                      className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow bg-white"
                    >
                      {SHOP_LABELS.map((l) => (
                        <option key={l} value={l}>
                          Shop {l}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addManager}
                      disabled={savingTeam || !newManager.name.trim()}
                      className="flex items-center gap-1 px-4 py-2.5 bg-yellow text-black text-sm font-semibold rounded-lg hover:bg-yellow/90 disabled:opacity-50"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                </Section>

                {/* Managers grouped by shop */}
                <Section title="DUTY MANAGERS">
                  {SHOP_LABELS.map((label) => {
                    const shopMgrs = managers.filter(
                      (m) => m.shop_label === label
                    );
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
                                onClick={() =>
                                  toggleManagerActive(m.id, m.is_active)
                                }
                                className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                                  m.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-200 text-gray-500'
                                }`}
                              >
                                {m.is_active ? 'Active' : 'Inactive'}
                              </button>
                              <button
                                onClick={() => deleteManager(m.id, m.name)}
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
                  <div className="space-y-3">
                    {SHOP_LABELS.map((label) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-sm font-bold w-16">
                          Shop {label}
                        </span>
                        <input
                          type="text"
                          value={passwordDraft[label] || ''}
                          onChange={(e) =>
                            setPasswordDraft((d) => ({
                              ...d,
                              [label]: e.target.value,
                            }))
                          }
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yellow"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={savePasswords}
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
            )}
          </>
        )}

        {/* ─── TAB 7: ANALYTICS ──────────────────────── */}
        {tab === 'analytics' && (
          <>
            {loading ? (
              <Spinner />
            ) : (
              <div className="space-y-8">
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: Package, label: 'Total', value: analytics.total },
                    { icon: Clock, label: 'Pending', value: analytics.pending },
                    { icon: Eye, label: 'Published', value: analytics.published },
                    { icon: ShoppingBag, label: 'Sold', value: analytics.sold },
                    { icon: EyeOff, label: 'Hidden', value: analytics.hidden },
                    {
                      icon: MousePointerClick,
                      label: 'WA Clicks',
                      value: analytics.clicks,
                    },
                    { icon: Eye, label: 'Total Views', value: analytics.views },
                    {
                      icon: DollarSign,
                      label: 'Revenue',
                      value: `AED ${allItems
                        .filter((i) => i.is_sold)
                        .reduce((s, i) => s + (Number(i.sale_price) || 0), 0)
                        .toLocaleString()}`,
                    },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.label}
                        className="bg-gray-50 rounded-xl p-4"
                      >
                        <Icon size={20} className="text-yellow mb-1.5" />
                        <p className="font-heading text-2xl">{s.value}</p>
                        <p className="text-xs text-muted">{s.label}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Top 5 by clicks */}
                <div className="grid md:grid-cols-2 gap-6">
                  <RankList
                    title="TOP BY WHATSAPP CLICKS"
                    items={analytics.topClicks}
                    metric={(i) => `${i.whatsapp_clicks} clicks`}
                  />
                  <RankList
                    title="TOP BY VIEWS"
                    items={analytics.topViews}
                    metric={(i) => `${i.view_count} views`}
                  />
                </div>

                {/* Breakdown */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Breakdown title="ITEMS PER SHOP" data={analytics.byShop} />
                  <Breakdown
                    title="ITEMS PER CATEGORY"
                    data={analytics.byCategory}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function EditPanel({
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

function Section({
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

function Field({
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

function FieldTextarea({
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

function RankList({
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
            <div
              key={item.id}
              className="flex items-center gap-3"
            >
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

function Breakdown({
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
