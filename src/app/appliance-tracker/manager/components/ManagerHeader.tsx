'use client';

import { Loader2, RefreshCw, Grid3X3 } from 'lucide-react';

export function ManagerHeader({
  workerName,
  lastRefreshedTime,
  totalItems,
  onRefresh,
  refreshing,
  onExportToSheets,
  sheetsExporting,
}: {
  workerName: string;
  lastRefreshedTime: string;
  totalItems: number;
  onRefresh: () => void;
  refreshing: boolean;
  onExportToSheets: () => void;
  sheetsExporting: boolean;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-gray-800 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-lg text-yellow">OPERATIONS DASHBOARD</h1>
          <p className="text-xs text-gray-500">
            {workerName}
            {lastRefreshedTime && <> &middot; Updated {lastRefreshedTime}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full">
            {totalItems}
          </span>
          <button
            onClick={onExportToSheets}
            disabled={sheetsExporting}
            className="px-3 py-2 rounded-lg bg-yellow text-black font-bold text-xs flex items-center gap-1.5 active:scale-95 min-h-[40px] disabled:opacity-50"
          >
            {sheetsExporting ? <Loader2 size={14} className="animate-spin" /> : <Grid3X3 size={14} />}
            Sheets
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-gray-800 text-gray-300 active:scale-95 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
}
