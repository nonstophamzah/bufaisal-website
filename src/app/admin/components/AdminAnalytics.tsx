'use client';

import {
  Package,
  Clock,
  Eye,
  EyeOff,
  MousePointerClick,
  DollarSign,
  ShoppingBag,
} from 'lucide-react';
import { ShopItem } from '@/lib/supabase';
import { RankList, Breakdown, Spinner } from './shared';

export interface AnalyticsData {
  total: number;
  pending: number;
  published: number;
  sold: number;
  hidden: number;
  clicks: number;
  views: number;
  topClicks: ShopItem[];
  topViews: ShopItem[];
  byShop: Record<string, number>;
  byCategory: Record<string, number>;
}

export function AdminAnalytics({
  loading,
  analytics,
  allItems,
}: {
  loading: boolean;
  analytics: AnalyticsData;
  allItems: ShopItem[];
}) {
  if (loading) return <Spinner />;

  const revenue = allItems
    .filter((i) => i.is_sold)
    .reduce((s, i) => s + (Number(i.sale_price) || 0), 0)
    .toLocaleString();

  return (
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
            value: `AED ${revenue}`,
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-gray-50 rounded-xl p-4">
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
        <Breakdown title="ITEMS PER CATEGORY" data={analytics.byCategory} />
      </div>
    </div>
  );
}
