'use client';

import { AlertCircle, Clock, AlertTriangle } from 'lucide-react';

export function AlertBanner({
  overdueCount,
  pendingCount,
  flaggedCount = 0,
  onJumpToFlagged,
}: {
  overdueCount: number;
  pendingCount: number;
  flaggedCount?: number;
  onJumpToFlagged?: () => void;
}) {
  if (overdueCount === 0 && pendingCount === 0 && flaggedCount === 0) return null;

  return (
    <div className="px-4 pt-4 space-y-2">
      {/* Highest priority — cleaner flagged something weird */}
      {flaggedCount > 0 && (
        <button
          onClick={onJumpToFlagged}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-left active:scale-[0.99] transition-transform"
        >
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-400">
              {flaggedCount} FLAGGED BY CLEANER
            </p>
            <p className="text-xs text-amber-400/70">Tap to review and clear</p>
          </div>
          <span className="font-heading text-2xl text-amber-400">{flaggedCount}</span>
        </button>
      )}

      {overdueCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/15 border border-red-500/30">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-400">{overdueCount} OVERDUE AT JURF</p>
            <p className="text-xs text-red-400/70">Sent over 24 hours ago, not yet received</p>
          </div>
          <span className="font-heading text-2xl text-red-400">{overdueCount}</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/15 border border-orange-500/30">
          <Clock size={20} className="text-orange-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-400">{pendingCount} PENDING APPROVAL</p>
            <p className="text-xs text-orange-400/70">Items waiting for manager review</p>
          </div>
          <span className="font-heading text-2xl text-orange-400">{pendingCount}</span>
        </div>
      )}
    </div>
  );
}
