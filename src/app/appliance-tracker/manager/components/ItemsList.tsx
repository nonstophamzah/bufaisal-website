'use client';

import { Search, X, Download } from 'lucide-react';
import { ItemCard } from './ItemCard';
import { Section } from './Section';
import { Package } from 'lucide-react';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  status: string | null;
  condition: string | null;
  location_status: string | null;
  problems: string[] | null;
  shop: string | null;
  photo_url: string | null;
  needs_jurf: boolean;
  date_received: string | null;
  date_sent_to_jurf: string | null;
  tested_by: string | null;
  repair_notes: string | null;
  repair_cost: number | null;
  destination_shop: string | null;
  created_by: string | null;
  created_at: string;
  approval_status: string | null;
}

const SHOPS_F = ['All', 'A', 'B', 'C', 'D', 'E'];
const STATUSES_F = ['All', 'Working', 'Not Working', 'Pending Scrap', 'Repaired', 'In Transit', 'At Jurf', 'Delivered'];
const DATES_F = ['All Time', 'Today', 'This Week', 'This Month'];

export function ItemsList({
  filteredItems,
  searchResults,
  searchQuery,
  onSearchChange,
  listTab,
  onTabChange,
  approvedCount,
  rejectedCount,
  shopFilter,
  onShopFilterChange,
  statusFilter,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
  onExportCSV,
  visibleCount,
  onLoadMore,
  expandedId,
  onToggleExpand,
  renderItemActions,
}: {
  filteredItems: Item[];
  searchResults: Item[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  listTab: 'approved' | 'rejected';
  onTabChange: (tab: 'approved' | 'rejected') => void;
  approvedCount: number;
  rejectedCount: number;
  shopFilter: string;
  onShopFilterChange: (shop: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  dateFilter: string;
  onDateFilterChange: (date: string) => void;
  onExportCSV: () => void;
  visibleCount: number;
  onLoadMore: () => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  renderItemActions?: (item: Item) => React.ReactNode;
}) {
  return (
    <Section title="ITEMS LIST" icon={Package} defaultOpen={true}>
      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by barcode..."
          className="w-full pl-10 pr-10 py-3 text-base border-2 border-gray-700 bg-gray-900 text-white rounded-xl focus:outline-none focus:border-yellow placeholder:text-gray-600"
        />
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        {searchQuery && (
          <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="mb-3 space-y-2 max-h-[50vh] overflow-y-auto bg-white rounded-xl p-3">
          <p className="text-xs text-gray-500">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </p>
          {searchResults.slice(0, 10).map((item, idx) => (
            <ItemCard
              key={item.id}
              item={item}
              idx={idx}
              isExpanded={expandedId === item.id}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
      {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
        <p className="text-sm text-gray-500 mb-3">No items match &quot;{searchQuery}&quot;</p>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => onTabChange('approved')}
          className={`px-4 py-2 rounded-lg text-sm font-bold min-h-[44px] ${
            listTab === 'approved' ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'
          }`}
        >
          APPROVED ({approvedCount})
        </button>
        <button
          onClick={() => onTabChange('rejected')}
          className={`px-4 py-2 rounded-lg text-sm font-bold min-h-[44px] ${
            listTab === 'rejected' ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'
          }`}
        >
          REJECTED ({rejectedCount})
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-3">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {SHOPS_F.map((s) => (
            <button
              key={s}
              onClick={() => onShopFilterChange(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 min-h-[36px] ${
                shopFilter === s ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {s === 'All' ? 'All Shops' : `Shop ${s}`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {STATUSES_F.map((s) => (
            <button
              key={s}
              onClick={() => onStatusFilterChange(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 min-h-[36px] ${
                statusFilter === s ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {DATES_F.map((d) => (
            <button
              key={d}
              onClick={() => onDateFilterChange(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 min-h-[36px] ${
                dateFilter === d ? 'bg-yellow text-black' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {d}
            </button>
          ))}
          <button
            onClick={onExportCSV}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 active:scale-95 flex items-center gap-1 text-xs font-bold min-h-[36px]"
          >
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {filteredItems.length} {listTab} items
      </p>

      {/* Items */}
      {filteredItems.length === 0 ? (
        <p className="text-center text-gray-500 py-10 font-heading text-lg">NO ITEMS FOUND</p>
      ) : (
        <div className="space-y-1.5">
          {filteredItems.slice(0, visibleCount).map((item, idx) => (
            <ItemCard
              key={item.id}
              item={item}
              idx={idx}
              isExpanded={expandedId === item.id}
              onToggleExpand={onToggleExpand}
              actions={renderItemActions ? renderItemActions(item) : undefined}
            />
          ))}
          {visibleCount < filteredItems.length && (
            <button
              onClick={onLoadMore}
              className="w-full py-4 text-center text-sm font-bold text-gray-400 bg-gray-800 rounded-xl active:scale-95"
            >
              Load more ({filteredItems.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
