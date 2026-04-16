export default function ShopLoading() {
  return (
    <div className="pt-20 pb-16 max-w-7xl mx-auto px-4">
      <div className="animate-pulse space-y-6">
        {/* Search bar skeleton */}
        <div className="h-12 bg-gray-100 rounded-xl w-full max-w-md" />

        {/* Category pills */}
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-24 bg-gray-100 rounded-full flex-shrink-0" />
          ))}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="bg-gray-100 rounded-xl aspect-square" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="h-5 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
