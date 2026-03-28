'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  X,
  ShoppingBag,
  Loader2,
  LogOut,
  Eye,
  MousePointerClick,
  DollarSign,
  Package,
  Clock,
} from 'lucide-react';
import { supabase, ShopItem } from '@/lib/supabase';

const ADMIN_PINS: Record<string, string> = {
  '0000': 'Admin',
  '3333': 'Humaan',
};

type Tab = 'pending' | 'published' | 'sold' | 'stats';

interface Stats {
  total: number;
  pending: number;
  published: number;
  sold: number;
  whatsappClicks: number;
  revenue: number;
}

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    published: 0,
    sold: 0,
    whatsappClicks: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    const name = ADMIN_PINS[pin];
    if (name) {
      setUser(name);
      setError('');
    } else {
      setError('Invalid admin PIN');
    }
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('shop_items').select('*');

    if (tab === 'pending') {
      query = query.eq('is_published', false).eq('is_sold', false);
    } else if (tab === 'published') {
      query = query.eq('is_published', true).eq('is_sold', false);
    } else if (tab === 'sold') {
      query = query.eq('is_sold', true);
    }

    query = query.order('created_at', { ascending: false });

    const { data } = await query;
    setItems(data || []);
    setLoading(false);
  }, [tab]);

  const fetchStats = useCallback(async () => {
    const { data: all } = await supabase.from('shop_items').select('*');
    if (all) {
      setStats({
        total: all.length,
        pending: all.filter((i) => !i.is_published && !i.is_sold).length,
        published: all.filter((i) => i.is_published && !i.is_sold).length,
        sold: all.filter((i) => i.is_sold).length,
        whatsappClicks: all.reduce(
          (sum, i) => sum + (i.whatsapp_clicks || 0),
          0
        ),
        revenue: all
          .filter((i) => i.is_sold)
          .reduce((sum, i) => sum + (Number(i.sale_price) || 0), 0),
      });
    }
  }, []);

  useEffect(() => {
    if (user) {
      if (tab === 'stats') {
        fetchStats();
      } else {
        fetchItems();
      }
    }
  }, [user, tab, fetchItems, fetchStats]);

  const handleApprove = async (id: string) => {
    await supabase
      .from('shop_items')
      .update({
        is_published: true,
        approved_by: user,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);
    fetchItems();
  };

  const handleReject = async (id: string) => {
    await supabase.from('shop_items').delete().eq('id', id);
    fetchItems();
  };

  const handleMarkSold = async (id: string) => {
    await supabase.from('shop_items').update({ is_sold: true }).eq('id', id);
    fetchItems();
  };

  // PIN login screen
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
              className="w-full bg-yellow text-black font-semibold py-3 rounded-xl hover:bg-yellow/90 transition-colors"
            >
              Login
            </button>
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'published', label: 'Published', count: stats.published },
    { key: 'sold', label: 'Sold', count: stats.sold },
    { key: 'stats', label: 'Stats' },
  ];

  return (
    <div className="pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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
        <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-yellow text-black'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span className="ml-1.5 bg-black/10 px-1.5 py-0.5 rounded text-xs">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {tab === 'stats' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                icon: Package,
                label: 'Total Items',
                value: stats.total,
              },
              {
                icon: Clock,
                label: 'Pending',
                value: stats.pending,
              },
              {
                icon: Eye,
                label: 'Published',
                value: stats.published,
              },
              {
                icon: ShoppingBag,
                label: 'Sold',
                value: stats.sold,
              },
              {
                icon: MousePointerClick,
                label: 'WhatsApp Clicks',
                value: stats.whatsappClicks,
              },
              {
                icon: DollarSign,
                label: 'Revenue (Sold)',
                value: `AED ${stats.revenue.toLocaleString()}`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-light rounded-xl p-5"
              >
                <stat.icon size={22} className="text-yellow mb-2" />
                <p className="font-heading text-2xl">{stat.value}</p>
                <p className="text-xs text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Items list */}
        {tab !== 'stats' && (
          <>
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={32} className="animate-spin text-yellow" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-20">
                <p className="font-heading text-2xl mb-2">NO ITEMS</p>
                <p className="text-muted text-sm">
                  Nothing in this category yet
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4"
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      {(item.thumbnail_url || item.image_urls?.[0]) && (
                        <img
                          src={item.thumbnail_url || item.image_urls[0]}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {item.item_name}
                      </h3>
                      <p className="text-xs text-muted">
                        {item.category} &bull; {item.shop_source || 'N/A'}{' '}
                        &bull; by {item.uploaded_by || 'Unknown'}
                      </p>
                      <p className="font-heading text-lg mt-0.5">
                        AED {item.sale_price}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      {tab === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="w-9 h-9 bg-green-100 text-green-600 rounded-lg flex items-center justify-center hover:bg-green-200 transition-colors"
                            title="Approve"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200 transition-colors"
                            title="Reject"
                          >
                            <X size={18} />
                          </button>
                        </>
                      )}
                      {tab === 'published' && (
                        <button
                          onClick={() => handleMarkSold(item.id)}
                          className="px-3 py-1.5 bg-yellow text-black text-xs font-semibold rounded-lg hover:bg-yellow/90 transition-colors"
                        >
                          Mark Sold
                        </button>
                      )}
                      {tab === 'sold' && (
                        <span className="text-xs text-muted">
                          {item.whatsapp_clicks} clicks
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
