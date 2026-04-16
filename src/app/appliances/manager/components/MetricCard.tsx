'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function MetricCard({
  label,
  value,
  trend,
  color,
}: {
  label: string;
  value: number;
  trend?: number;
  color?: string;
}) {
  return (
    <div className={`rounded-xl p-3 border border-gray-800 ${color || 'bg-dark'}`}>
      <p className="font-heading text-3xl text-white">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-gray-400">{label}</p>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 text-xs font-bold ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}
          </div>
        )}
        {trend === 0 && (
          <div className="flex items-center gap-0.5 text-xs text-gray-500">
            <Minus size={12} />
          </div>
        )}
      </div>
    </div>
  );
}
