'use client';

import { Activity, BarChart3, DollarSign } from 'lucide-react';
import { Section } from './Section';
import { MetricCard } from './MetricCard';

function fmtCurrency(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function MetricsGrid({
  metrics,
  trends,
  shopCounts,
  maxShopCount,
  costMetrics,
  onShopFilterChange,
  activeShopFilter,
}: {
  metrics: {
    totalActive: number;
    inRepair: number;
    readyToShip: number;
    delivered: number;
    working: number;
    notWorking: number;
    pendingScrap: number;
    scrap: number;
  };
  trends: { intakeDelta: number };
  shopCounts: Record<string, number>;
  maxShopCount: number;
  costMetrics: {
    totalCost: number;
    avgCost: number;
    mostExpensive: { barcode: string; repair_cost: number | null } | null;
    count: number;
  };
  onShopFilterChange: (shop: string) => void;
  activeShopFilter: string;
}) {
  return (
    <>
      {/* Pipeline Metrics */}
      <Section title="PIPELINE METRICS" icon={Activity} defaultOpen={true}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard label="Total Active" value={metrics.totalActive} trend={trends.intakeDelta} />
          <MetricCard label="In Repair" value={metrics.inRepair} color="bg-dark" />
          <MetricCard label="Ready to Ship" value={metrics.readyToShip} color="bg-dark" />
          <MetricCard label="Delivered" value={metrics.delivered} color="bg-dark" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <MetricCard label="Working" value={metrics.working} />
          <MetricCard label="Not Working" value={metrics.notWorking} />
          <MetricCard label="Pending Scrap" value={metrics.pendingScrap} />
          <MetricCard label="Scrap" value={metrics.scrap} />
        </div>
      </Section>

      {/* Shop Breakdown */}
      <Section title="SHOP BREAKDOWN" icon={BarChart3} defaultOpen={true}>
        <div className="space-y-2">
          {['A', 'B', 'C', 'D', 'E'].map((s) => {
            const count = shopCounts[s] || 0;
            const pct = maxShopCount > 0 ? (count / maxShopCount) * 100 : 0;
            const isActive = activeShopFilter === s;
            return (
              <button
                key={s}
                onClick={() => onShopFilterChange(isActive ? 'All' : s)}
                className={`w-full flex items-center gap-3 group min-h-[44px] ${isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
              >
                <span className={`font-heading text-lg w-8 text-right ${isActive ? 'text-yellow' : 'text-gray-400'}`}>
                  {s}
                </span>
                <div className="flex-1 bg-gray-800 rounded-full h-7 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isActive ? 'bg-yellow' : 'bg-yellow/60'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className={`font-heading text-lg w-8 ${isActive ? 'text-yellow' : 'text-white'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Repair Costs */}
      <Section title="REPAIR COSTS" icon={DollarSign} defaultOpen={true}>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl p-3 border border-gray-800 bg-dark">
            <p className="text-xs text-gray-400 mb-1">Total Spent</p>
            <p className="font-heading text-xl text-white">AED {fmtCurrency(costMetrics.totalCost)}</p>
            <p className="text-[10px] text-gray-500 mt-1">{costMetrics.count} repairs</p>
          </div>
          <div className="rounded-xl p-3 border border-gray-800 bg-dark">
            <p className="text-xs text-gray-400 mb-1">Avg / Item</p>
            <p className="font-heading text-xl text-white">AED {fmtCurrency(Math.round(costMetrics.avgCost))}</p>
          </div>
          <div className="rounded-xl p-3 border border-gray-800 bg-dark">
            <p className="text-xs text-gray-400 mb-1">Most Expensive</p>
            <p className="font-heading text-xl text-white">
              {costMetrics.mostExpensive ? `AED ${fmtCurrency(costMetrics.mostExpensive.repair_cost || 0)}` : '—'}
            </p>
            {costMetrics.mostExpensive && (
              <p className="text-[10px] text-gray-500 mt-1 truncate">{costMetrics.mostExpensive.barcode}</p>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
